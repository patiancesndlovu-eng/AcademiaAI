import { prisma } from '../config/db'
import { env } from '../config/env'
import * as storage from './storage'
import * as ocr from './ocr'
import { extractDomain } from '../utils/url'

const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100

export async function listSources(
  notebookId: string,
  options: {
    status?: string
    search?: string
    page?: number
    pageSize?: number
  }
) {
  const page = Math.max(1, options.page || 1)
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, options.pageSize || DEFAULT_PAGE_SIZE))
  const skip = (page - 1) * pageSize

  const where: any = {
    notebookId,
    deletedAt: null,
  }

  if (options.status) {
    where.status = options.status
  }

  if (options.search && options.search.trim().length > 0) {
    const trimmed = options.search.trim().slice(0, 100)
    where.OR = [
      { title: { contains: trimmed, mode: 'insensitive' } },
      { domain: { contains: trimmed, mode: 'insensitive' } },
    ]
  }

  const [data, total] = await Promise.all([
    prisma.source.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
      select: {
        id: true,
        type: true,
        title: true,
        domain: true,
        status: true,
        selected: true,
        wordCount: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.source.count({ where }),
  ])

  return { data, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } }
}

export async function getSource(sourceId: string, userId: string) {
  const source = await prisma.source.findFirst({
    where: {
      id: sourceId,
      deletedAt: null,
      notebook: {
        deletedAt: null,
        OR: [{ ownerId: userId }, { members: { some: { userId } } }],
      },
    },
    include: {
      chunks: {
        select: { id: true, text: true, pageOffset: true, startOffset: true, endOffset: true },
      },
    },
  })
  return source
}

export async function addUrlSource(
  notebookId: string,
  userId: string,
  data: { url: string; title?: string }
) {
  const domain = extractDomain(data.url)

  const source = await prisma.source.create({
    data: {
      notebookId,
      type: 'url',
      title: data.title || domain,
      canonicalUrl: data.url,
      domain,
      status: 'queued',
    },
  })

  // Async processing (fire-and-forget for MVP; replace with job queue for production)
  processUrlSource(source.id, data.url).catch(console.error)

  return source
}

export async function addTextSource(
  notebookId: string,
  data: { title: string; text: string }
) {
  const wordCount = data.text.trim().split(/\s+/).length

  const source = await prisma.source.create({
    data: {
      notebookId,
      type: 'text',
      title: data.title,
      extractedText: data.text,
      status: 'ready',
      wordCount,
    },
  })

  // Chunk immediately since text is already extracted
  await chunkSource(source.id, data.text)

  return source
}

export async function createUploadIntent(
  notebookId: string,
  data: { filename: string; contentType: string; size: number }
) {
  // Validate MIME type
  const allowedTypes = [
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/webp',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ]

  if (!allowedTypes.includes(data.contentType)) {
    throw new Error(`Unsupported file type: ${data.contentType}`)
  }

  if (data.size > env.MAX_FILE_SIZE) {
    throw new Error(`File too large. Max size: ${env.MAX_FILE_SIZE} bytes`)
  }

  const safeName = storage.sanitizeFilename(data.filename)
  const filePath = storage.generatePath(notebookId, safeName)

  return {
    filePath,
    uploadUrl: `/api/v1/internal/upload?path=${encodeURIComponent(filePath)}`,
    // In production, return a signed S3/MinIO URL here instead
  }
}

export async function completeUpload(
  notebookId: string,
  userId: string,
  data: { filePath: string; originalName: string }
) {
  // Verify file exists on disk
  if (!storage.fileExists(data.filePath)) {
    throw new Error('Uploaded file not found')
  }

  const ext = data.originalName.split('.').pop()?.toLowerCase() || ''
  const isImage = ['png', 'jpg', 'jpeg', 'webp'].includes(ext)
  const isPdf = ext === 'pdf'

  const source = await prisma.source.create({
    data: {
      notebookId,
      type: 'upload',
      title: data.originalName,
      filePath: data.filePath,
      status: 'queued',
    },
  })

  // Async processing
  processUploadSource(source.id, data.filePath, { isImage, isPdf }).catch(console.error)

  return source
}

export async function batchSelect(notebookId: string, sourceIds: string[], selected: boolean) {
  await prisma.source.updateMany({
    where: { id: { in: sourceIds }, notebookId, deletedAt: null },
    data: { selected, updatedAt: new Date() },
  })

  return { updated: sourceIds.length }
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
        OR: [
          { ownerId: userId },
          { members: { some: { userId, role: { in: ['owner', 'editor'] } } } },
        ],
      },
    },
  })

  if (!existing) return null

  return prisma.source.update({
    where: { id: sourceId },
    data: { ...data, updatedAt: new Date() },
  })
}

export async function softDeleteSource(sourceId: string, userId: string) {
  const existing = await prisma.source.findFirst({
    where: {
      id: sourceId,
      deletedAt: null,
      notebook: {
        deletedAt: null,
        OR: [
          { ownerId: userId },
          { members: { some: { userId, role: { in: ['owner', 'editor'] } } } },
        ],
      },
    },
  })

  if (!existing) return null

  // Delete file if exists
  if (existing.filePath) {
    storage.deleteFile(existing.filePath).catch(console.error)
  }

  return prisma.source.update({
    where: { id: sourceId },
    data: { deletedAt: new Date(), updatedAt: new Date() },
  })
}

export async function retrySource(sourceId: string, userId: string) {
  const existing = await prisma.source.findFirst({
    where: {
      id: sourceId,
      deletedAt: null,
      status: 'failed',
      notebook: {
        deletedAt: null,
        OR: [
          { ownerId: userId },
          { members: { some: { userId, role: { in: ['owner', 'editor'] } } } },
        ],
      },
    },
  })

  if (!existing) return null

  // Reset and re-queue
  const updated = await prisma.source.update({
    where: { id: sourceId },
    data: {
      status: 'queued',
      processingError: null,
      extractedText: null,
      wordCount: null,
      updatedAt: new Date(),
    },
  })

  if (existing.type === 'upload' && existing.filePath) {
    const ext = existing.title.split('.').pop()?.toLowerCase() || ''
    processUploadSource(sourceId, existing.filePath, {
      isImage: ['png', 'jpg', 'jpeg', 'webp'].includes(ext),
      isPdf: ext === 'pdf',
    }).catch(console.error)
  } else if (existing.type === 'url' && existing.canonicalUrl) {
    processUrlSource(sourceId, existing.canonicalUrl).catch(console.error)
  }

  return updated
}

// ─── Async Processing Pipeline ───

async function processUrlSource(sourceId: string, url: string) {
  try {
    await prisma.source.update({ where: { id: sourceId }, data: { status: 'processing' } })

    const { text, title, domain, author } = await ocr.extractWebPage(url)
    const wordCount = text.trim().split(/\s+/).length

    await prisma.source.update({
      where: { id: sourceId },
      data: {
        title: title || undefined,
        domain: domain || undefined,
        author: author || undefined,
        extractedText: text,
        status: 'ready',
        wordCount,
        updatedAt: new Date(),
      },
    })

    await chunkSource(sourceId, text)
  } catch (err: any) {
    console.error(`URL processing failed for ${sourceId}:`, err)
    await prisma.source.update({
      where: { id: sourceId },
      data: {
        status: 'failed',
        processingError: err.message || 'Unknown error',
        updatedAt: new Date(),
      },
    })
  }
}

async function processUploadSource(
  sourceId: string,
  filePath: string,
  meta: { isImage: boolean; isPdf: boolean }
) {
  try {
    await prisma.source.update({ where: { id: sourceId }, data: { status: 'processing' } })

    let text = ''
    if (meta.isImage) {
      text = await ocr.extractImageText(filePath)
    } else if (meta.isPdf) {
      text = await ocr.extractPdfText(filePath)
    } else {
      text = await ocr.extractPlainText(filePath)
    }

    const wordCount = text.trim().split(/\s+/).length

    await prisma.source.update({
      where: { id: sourceId },
      data: {
        extractedText: text,
        status: 'ready',
        wordCount,
        updatedAt: new Date(),
      },
    })

    await chunkSource(sourceId, text)
  } catch (err: any) {
    console.error(`Upload processing failed for ${sourceId}:`, err)
    await prisma.source.update({
      where: { id: sourceId },
      data: {
        status: 'failed',
        processingError: err.message || 'Unknown error',
        updatedAt: new Date(),
      },
    })
  }
}

async function chunkSource(sourceId: string, text: string) {
  // Simple chunking: 1000 chars with 200 char overlap
  const CHUNK_SIZE = 1000
  const OVERLAP = 200
  const chunks: { text: string; startOffset: number; endOffset: number }[] = []

  for (let i = 0; i < text.length; i += CHUNK_SIZE - OVERLAP) {
    const end = Math.min(i + CHUNK_SIZE, text.length)
    chunks.push({
      text: text.slice(i, end),
      startOffset: i,
      endOffset: end,
    })
    if (end === text.length) break
  }

  await prisma.sourceChunk.createMany({
    data: chunks.map((c) => ({
      sourceId,
      text: c.text,
      startOffset: c.startOffset,
      endOffset: c.endOffset,
    })),
  })
}