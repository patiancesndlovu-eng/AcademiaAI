import { Job, UnrecoverableError, Worker } from 'bullmq'
import { SourceStatus, SourceType } from '@prisma/client'
import { prisma } from '../config/db'
import { bullmqConnection } from '../config/redis'
import { QUEUES, IngestionJobData } from '../queues/jobTypes'
import { invalidateSourceListCache, invalidateRetrievalCache } from '../cache/invalidation'
import * as storage from '../services/storage'
import { extractPdf } from '../services/extraction/pdf'
import { ocrImage, ocrPdf, NoTextDetectedError } from '../services/extraction/vision'
import { extractWebPage } from '../services/extraction/web'
import { detectFileKind } from '../utils/magicBytes'
import { normalizeText, countWords } from '../utils/text'
import { chunkText, chunkPages, Chunk } from '../utils/chunker'
import { AppError } from '../utils/errors'
import { logger } from '../utils/logger'

/**
 * Ingestion worker (spec §20/§21/§55). Runs in its own process from
 * src/workers/worker.ts. Duplicate execution is safe: a guarded
 * queued→processing claim plus a replace-in-transaction chunk write make
 * re-runs idempotent.
 */

const log = logger.child({ component: 'ingestion-worker' })

const MAX_CHUNKS_PER_SOURCE = 400
const MAX_STORED_TEXT_CHARS = 500_000

// Progress checkpoints (spec §147)
const PROGRESS_CLAIMED = 10
const PROGRESS_EXTRACTING = 30
const PROGRESS_EXTRACTED = 60
const PROGRESS_CHUNKED = 80
const PROGRESS_DONE = 100

async function setProgress(sourceId: string, progress: number): Promise<void> {
  await prisma.source
    .update({ where: { id: sourceId }, data: { progress, updatedAt: new Date() } })
    .catch(() => undefined)
}

async function markFailed(sourceId: string, code: string): Promise<void> {
  const updated = await prisma.source
    .update({
      where: { id: sourceId },
      data: { status: SourceStatus.failed, processingError: code.slice(0, 200), progress: 0, updatedAt: new Date() },
      select: { notebookId: true },
    })
    .catch((err) => {
      log.error({ err: (err as Error).message, sourceId }, 'Failed to mark source failed')
      return null
    })
  if (updated) {
    invalidateSourceListCache(updated.notebookId)
    invalidateRetrievalCache(updated.notebookId)
  }
}

function invalidate(source: { id: string; notebookId: string }): void {
  invalidateSourceListCache(source.notebookId)
  invalidateRetrievalCache(source.notebookId)
}

interface ExtractionResult {
  chunks: Chunk[]
  fullText: string
  meta?: { title?: string; domain?: string; author?: string }
}

async function extractUpload(source: { id: string; filePath: string | null; title: string }): Promise<ExtractionResult> {
  if (!source.filePath) {
    throw new AppError('STORAGE_ERROR', 'Source file path missing', 500, false)
  }
  const buffer = await storage.readFileBuffer(source.filePath)
  const kind = detectFileKind(buffer)

  if (kind === 'pdf') {
    const pdf = await extractPdf(buffer)
    if (pdf.needsOcrFallback) {
      // Scanned PDF — Gemini Vision transcription (page info not recoverable)
      const text = normalizeText(await ocrPdf(buffer))
      if (!text.trim()) throw new NoTextDetectedError()
      return { chunks: chunkText(text), fullText: text }
    }
    const pages = pdf.pages.map((p) => ({ text: normalizeText(p.text), page: p.page }))
    return { chunks: chunkPages(pages), fullText: pages.map((p) => p.text).join('\n\n') }
  }

  if (kind === 'png' || kind === 'jpeg' || kind === 'webp') {
    const mime = kind === 'png' ? 'image/png' : kind === 'jpeg' ? 'image/jpeg' : 'image/webp'
    const text = normalizeText(await ocrImage(buffer, mime))
    return { chunks: chunkText(text), fullText: text }
  }

  if (kind === 'text') {
    const text = normalizeText(buffer.toString('utf8'))
    if (!text.trim()) throw new NoTextDetectedError()
    return { chunks: chunkText(text), fullText: text }
  }

  throw new AppError('UNSUPPORTED_FORMAT', 'Unsupported file contents', 400, false)
}

async function extractUrl(url: string): Promise<ExtractionResult> {
  const page = await extractWebPage(url)
  const text = normalizeText(page.text)
  if (!text.trim()) {
    throw new AppError('NO_TEXT_DETECTED', 'The page contained no extractable text', 400, false)
  }
  return {
    chunks: chunkText(text),
    fullText: text,
    meta: { title: page.title, domain: page.domain, author: page.author },
  }
}

async function extractStoredText(raw: string): Promise<ExtractionResult> {
  const text = normalizeText(raw)
  if (!text.trim()) throw new NoTextDetectedError()
  return { chunks: chunkText(text), fullText: text }
}

export async function processIngestionJob(job: Job<IngestionJobData>): Promise<{ status: string }> {
  const { sourceId } = job.data

  const source = await prisma.source.findUnique({
    where: { id: sourceId },
    select: { id: true, notebookId: true, type: true, title: true, canonicalUrl: true, filePath: true, extractedText: true, status: true, deletedAt: true },
  })

  // Deleted or already-finished sources are a no-op (idempotency, spec §55)
  if (!source || source.deletedAt || source.status === SourceStatus.ready) {
    return { status: 'already-done' }
  }

  if (source.status === SourceStatus.queued) {
    // Guarded claim: only one worker transitions queued → processing (spec §17)
    const claimed = await prisma.source.updateMany({
      where: { id: sourceId, status: SourceStatus.queued },
      data: { status: SourceStatus.processing, progress: PROGRESS_CLAIMED, updatedAt: new Date() },
    })
    if (claimed.count === 0) {
      return { status: 'claimed-elsewhere' }
    }
  } else if (source.status === SourceStatus.processing && job.attemptsMade === 0) {
    // Another run owns this source right now
    return { status: 'claimed-elsewhere' }
  } else if (source.status === SourceStatus.failed) {
    return { status: 'stale' }
  }

  try {
    await setProgress(sourceId, PROGRESS_EXTRACTING)

    let result: ExtractionResult
    if (source.type === SourceType.upload) {
      result = await extractUpload({ id: source.id, filePath: source.filePath, title: source.title })
    } else if (source.type === SourceType.url) {
      if (!source.canonicalUrl) throw new AppError('BAD_REQUEST', 'Source URL missing', 400, false)
      result = await extractUrl(source.canonicalUrl)
    } else {
      result = await extractStoredText(source.extractedText ?? '')
    }

    await setProgress(sourceId, PROGRESS_EXTRACTED)

    const chunks = result.chunks.slice(0, MAX_CHUNKS_PER_SOURCE)
    await setProgress(sourceId, PROGRESS_CHUNKED)

    const wordCount = countWords(result.fullText)

    await prisma.$transaction(async (tx) => {
      const fresh = await tx.source.findUnique({ where: { id: sourceId }, select: { deletedAt: true } })
      if (!fresh || fresh.deletedAt) return // soft-deleted mid-processing → discard

      await tx.sourceChunk.deleteMany({ where: { sourceId } })
      if (chunks.length > 0) {
        await tx.sourceChunk.createMany({
          data: chunks.map((c) => ({
            sourceId,
            text: c.text,
            pageOffset: c.page ?? null,
            startOffset: c.startOffset,
            endOffset: c.endOffset,
          })),
        })
      }
      await tx.source.update({
        where: { id: sourceId },
        data: {
          status: SourceStatus.ready,
          progress: PROGRESS_DONE,
          processingError: null,
          extractedText: result.fullText.slice(0, MAX_STORED_TEXT_CHARS),
          wordCount,
          ...(result.meta?.title ? { title: result.meta.title } : {}),
          ...(result.meta?.domain ? { domain: result.meta.domain } : {}),
          ...(result.meta?.author ? { author: result.meta.author } : {}),
          updatedAt: new Date(),
        },
      })
    })

    invalidate({ id: sourceId, notebookId: source.notebookId })
    await job.updateProgress(PROGRESS_DONE)
    log.info({ sourceId, notebookId: source.notebookId, chunks: chunks.length, wordCount, attempt: job.attemptsMade + 1 }, 'source_ready')
    return { status: 'ready' }
  } catch (err) {
    const attempt = job.attemptsMade + 1
    const maxAttempts = job.opts.attempts ?? 1

    // Meaningful terminal states (spec §27)
    if (err instanceof NoTextDetectedError) {
      await markFailed(sourceId, 'NO_TEXT_DETECTED')
      invalidate({ id: sourceId, notebookId: source.notebookId })
      throw new UnrecoverableError('NO_TEXT_DETECTED')
    }
    if (err instanceof AppError && !err.retryable) {
      await markFailed(sourceId, err.code)
      invalidate({ id: sourceId, notebookId: source.notebookId })
      throw new UnrecoverableError(err.code)
    }

    // Retryable (timeouts, 429, 5xx, network) — BullMQ retries with backoff
    if (attempt >= maxAttempts) {
      await markFailed(sourceId, 'EXTRACTION_FAILED')
      invalidate({ id: sourceId, notebookId: source.notebookId })
    } else {
      log.warn({ sourceId, attempt, err: (err as Error).message }, 'ingestion attempt failed, retrying')
    }
    throw err
  }
}

export function startIngestionWorker(): Worker<IngestionJobData> {
  const worker = new Worker<IngestionJobData>(QUEUES.ingestion, processIngestionJob, {
    connection: bullmqConnection,
    concurrency: 2,
    lockDuration: 90_000,
    stalledInterval: 30_000,
    maxStalledCount: 3,
  })

  worker.on('failed', async (job, err) => {
    if (!job) return
    log.error({ jobId: job.id, sourceId: job.data.sourceId, err: err.message }, 'ingestion job failed')
    // Safety net: never leave a source stuck in processing after final failure
    await prisma.source
      .updateMany({
        where: { id: job.data.sourceId, status: SourceStatus.processing },
        data: { status: SourceStatus.failed, processingError: 'EXTRACTION_FAILED', progress: 0 },
      })
      .catch(() => undefined)
  })

  worker.on('error', (err) => log.error({ err: err.message }, 'ingestion worker error'))
  log.info('Ingestion worker started')
  return worker
}
