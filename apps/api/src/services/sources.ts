import { SourceStatus, SourceType, Prisma } from '@prisma/client'
import { prisma } from '../config/db'
import { env } from '../config/env'
import * as storage from './storage'
import * as uploadIntent from './uploadIntent'
import { enqueueIngestion } from '../queues/queues'
import { invalidateSourceListCache, invalidateRetrievalCache } from '../cache/invalidation'
import { cacheKeys, cacheTtls } from '../cache/keys'
import { getOrSet } from '../cache/cache'
import { normalizeText, countWords } from '../utils/text'
import { normalizeCanonicalUrl } from '../utils/url'
import { chunkText } from '../utils/chunker'
import { badRequest, conflict, serviceUnavailable } from '../utils/errors'

/**
 * Source service. Heavy processing (URL fetch, PDF/OCR, chunking of uploads)
 * happens in the ingestion worker — never inside an HTTP request (spec Rule 4).
 * Text sources are small and fully available at creation time, so they are
 * normalized and chunked synchronously.
 */

const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100

export interface ListSourcesOptions {
  status?: string
  search?: string
  page?: number
  pageSize?: number
}

export async function listSources(notebookId: string, options: ListSourcesOptions) {
  const page = Math.max(1, options.page || 1)
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, options.pageSize || DEFAULT_PAGE_SIZE))
  const skip = (page - 1) * pageSize

  const where: Prisma.SourceWhereInput = { notebookId, deletedAt: null }

  if (options.status) {
    where.status = options.status as SourceStatus
  }

  const trimmedSearch = options.search?.trim().slice(0, 100)
  if (trimmedSearch) {
    where.OR = [
      { title: { contains: trimmedSearch, mode: 'insensitive' } },
      { domain: { contains: trimmedSearch, mode: 'insensitive' } },
    ]
  }

  // Cache only unfiltered pages — filtered queries are cheap and varied
  const cacheable = !options.status && !trimmedSearch

  const load = async () => {
    const [data, total] = await Promise.all([
      prisma.source.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: pageSize,
        select: {
          id: true,
          type: true,
          title: true,
          canonicalUrl: true,
          domain: true,
          status: true,
          selected: true,
          wordCount: true,
          progress: true,
          processingError: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.source.count({ where }),
    ])
    return { data, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } }
  }

  if (cacheable) {
    return getOrSet(cacheKeys.notebookSources(notebookId, page, pageSize), cacheTtls.sourcesSec, load)
  }
  return load()
}

export async function getSource(sourceId: string, userId: string) {
  return prisma.source.findFirst({
    where: {
      id: sourceId,
      deletedAt: null,
      notebook: {
        deletedAt: null,
        OR: [{ ownerId: userId }, { members: { some: { userId } } }],
      },
    },
    select: {
      id: true,
      notebookId: true,
      type: true,
      title: true,
      canonicalUrl: true,
      domain: true,
      status: true,
      selected: true,
      wordCount: true,
      progress: true,
      processingError: true,
      createdAt: true,
      updatedAt: true,
      chunks: {
        select: { id: true, pageOffset: true, startOffset: true, endOffset: true },
        take: 50,
        orderBy: { startOffset: 'asc' },
      },
    },
  })
}

/** Enqueue ingestion; if the queue is unavailable the source fails honestly (spec §78). */
async function enqueueOrFail(
  sourceId: string,
  meta: { requestId?: string; userId?: string },
  attemptCycle: number
): Promise<void> {
  try {
    await enqueueIngestion({ sourceId, ...meta }, attemptCycle)
  } catch {
    await prisma.source
      .update({
        where: { id: sourceId },
        data: { status: SourceStatus.failed, processingError: 'QUEUE_UNAVAILABLE', progress: 0 },
      })
      .catch(() => undefined)
    throw serviceUnavailable('Processing queue is unavailable, please retry shortly')
  }
}

export async function addUrlSource(
  notebookId: string,
  userId: string,
  data: { url: string; title?: string },
  meta: { requestId?: string }
) {
  const canonical = normalizeCanonicalUrl(data.url)
  if (!canonical) {
    throw badRequest('Only http(s) URLs can be imported as sources')
  }

  // Duplicate protection: same normalized URL, same notebook, not deleted.
  const existing = await prisma.source.findFirst({
    where: { notebookId, canonicalUrl: canonical, deletedAt: null },
    select: { id: true },
  })
  if (existing) {
    throw conflict('This URL is already a source in this notebook')
  }

  const domain = new URL(canonical).hostname

  const source = await prisma.source.create({
    data: {
      notebookId,
      type: SourceType.url,
      title: (data.title || domain).slice(0, 200),
      canonicalUrl: canonical,
      domain,
      status: SourceStatus.queued,
    },
  })

  await enqueueOrFail(source.id, { requestId: meta.requestId, userId }, 1)
  invalidateSourceListCache(notebookId)

  return source
}

export async function addTextSource(
  notebookId: string,
  userId: string,
  data: { title: string; text: string },
  meta: { requestId?: string }
) {
  const normalized = normalizeText(data.text)

  // Large pastes go through the worker pipeline like any other source
  if (normalized.length > 20_000) {
    const source = await prisma.source.create({
      data: {
        notebookId,
        type: SourceType.text,
        title: data.title,
        extractedText: normalized,
        status: SourceStatus.queued,
      },
    })
    await enqueueOrFail(source.id, { requestId: meta.requestId, userId }, 1)
    invalidateSourceListCache(notebookId)
    return source
  }

  const chunks = chunkText(normalized)
  const source = await prisma.$transaction(async (tx) => {
    const created = await tx.source.create({
      data: {
        notebookId,
        type: SourceType.text,
        title: data.title,
        extractedText: normalized,
        status: SourceStatus.ready,
        wordCount: countWords(normalized),
        progress: 100,
      },
    })
    if (chunks.length > 0) {
      await tx.sourceChunk.createMany({
        data: chunks.map((c) => ({
          sourceId: created.id,
          text: c.text,
          startOffset: c.startOffset,
          endOffset: c.endOffset,
        })),
      })
    }
    return created
  })

  invalidateSourceListCache(notebookId)
  invalidateRetrievalCache(notebookId)
  return source
}

export function createUploadIntent(
  notebookId: string,
  userId: string,
  data: { filename: string; contentType: string; size: number }
) {
  return uploadIntent.createUploadIntent(notebookId, userId, data)
}

export async function completeUpload(
  notebookId: string,
  userId: string,
  data: { filePath: string },
  meta: { requestId?: string }
) {
  const intent = await uploadIntent.verifyUploadCompletion(data.filePath, userId)

  const source = await prisma.source.create({
    data: {
      notebookId,
      type: SourceType.upload,
      title: intent.originalName,
      filePath: data.filePath,
      status: SourceStatus.queued,
    },
  })

  await enqueueOrFail(source.id, { requestId: meta.requestId, userId }, 1)
  invalidateSourceListCache(notebookId)
  return source
}

export async function batchSelect(notebookId: string, sourceIds: string[], selected: boolean) {
  const result = await prisma.source.updateMany({
    where: { id: { in: sourceIds }, notebookId, deletedAt: null },
    data: { selected, updatedAt: new Date() },
  })
  invalidateSourceListCache(notebookId)
  invalidateRetrievalCache(notebookId)
  return { updated: result.count }
}

export async function updateSource(
  sourceId: string,
  userId: string,
  data: { title?: string; selected?: boolean }
) {
  const existing = await prisma.source.findFirst({
    where: {
      id: sourceId,
      deletedAt: null,
      notebook: {
        deletedAt: null,
        OR: [{ ownerId: userId }, { members: { some: { userId, role: { in: ['owner', 'editor'] } } } }],
      },
    },
    select: { id: true, notebookId: true },
  })
  if (!existing) return null

  const updated = await prisma.source.update({
    where: { id: sourceId },
    data: { ...data, updatedAt: new Date() },
  })
  invalidateSourceListCache(existing.notebookId)
  invalidateRetrievalCache(existing.notebookId)
  return updated
}

export async function softDeleteSource(sourceId: string, userId: string) {
  const existing = await prisma.source.findFirst({
    where: {
      id: sourceId,
      deletedAt: null,
      notebook: {
        deletedAt: null,
        OR: [{ ownerId: userId }, { members: { some: { userId, role: { in: ['owner', 'editor'] } } } }],
      },
    },
    select: { id: true, notebookId: true, filePath: true },
  })
  if (!existing) return null

  const updated = await prisma.source.update({
    where: { id: sourceId },
    data: { deletedAt: new Date(), selected: false, updatedAt: new Date() },
  })

  invalidateSourceListCache(existing.notebookId)
  invalidateRetrievalCache(existing.notebookId)

  // Storage cleanup is asynchronous and must not fail the delete (spec §112)
  if (existing.filePath) {
    void storage.deleteFile(existing.filePath).catch(() => undefined)
  }
  return updated
}

/**
 * Retry a failed source (spec §113): guarded failed→queued transition so a
 * concurrent retry cannot double-enqueue, previous error cleared, attempt
 * counter incremented, then re-enqueued with a fresh job cycle.
 */
export async function retrySource(
  sourceId: string,
  userId: string,
  meta: { requestId?: string }
) {
  const existing = await prisma.source.findFirst({
    where: {
      id: sourceId,
      deletedAt: null,
      status: SourceStatus.failed,
      notebook: {
        deletedAt: null,
        OR: [{ ownerId: userId }, { members: { some: { userId, role: { in: ['owner', 'editor'] } } } }],
      },
    },
    select: { id: true, notebookId: true, processingAttempts: true },
  })
  if (!existing) return null

  const claimed = await prisma.source.updateMany({
    where: { id: sourceId, status: SourceStatus.failed },
    data: {
      status: SourceStatus.queued,
      processingError: null,
      progress: 0,
      processingAttempts: { increment: 1 },
      updatedAt: new Date(),
    },
  })
  if (claimed.count === 0) return null // concurrent retry won the race

  const refreshed = await prisma.source.findUnique({
    where: { id: sourceId },
    select: { processingAttempts: true },
  })

  await enqueueOrFail(sourceId, { requestId: meta.requestId, userId }, (refreshed?.processingAttempts ?? 1) + 1)
  invalidateSourceListCache(existing.notebookId)
  invalidateRetrievalCache(existing.notebookId)

  return prisma.source.findUnique({ where: { id: sourceId } })
}

export const MAX_SOURCE_TEXT_CHARS = env.CONTEXT_MAX_CHARS
