import { Job, Worker } from 'bullmq'
import { SourceStatus } from '@prisma/client'
import { readdir, stat, unlink } from 'fs/promises'
import { join } from 'path'
import { prisma } from '../config/db'
import { bullmqConnection } from '../config/redis'
import { QUEUES, CleanupJobData } from '../queues/jobTypes'
import { enqueueIngestion } from '../queues/queues'
import { invalidateSourceListCache, invalidateRetrievalCache } from '../cache/invalidation'
import { uploadRoot } from '../services/storage'
import { logger } from '../utils/logger'

/**
 * Scheduled cleanup (spec §25/§58/§119/§120):
 *  1. recover sources stuck in `processing` (worker crash) — requeue or fail
 *  2. remove orphaned upload files (intent never completed / source deleted)
 *  3. hard-delete soft-deleted sources past the retention window
 */

const log = logger.child({ component: 'cleanup-worker' })

const STUCK_THRESHOLD_MS = 10 * 60_000 // processing without progress for 10 min
const MAX_RECOVERY_ATTEMPTS = 3
const ORPHAN_GRACE_MS = 24 * 60 * 60_000 // unreferenced files older than 24h
const SOURCE_RETENTION_MS = 30 * 24 * 60 * 60_000 // soft-deleted sources kept 30 days
const MAX_FILES_PER_RUN = 200

async function recoverStuckSources(): Promise<number> {
  const cutoff = new Date(Date.now() - STUCK_THRESHOLD_MS)

  const stuck = await prisma.source.findMany({
    where: { status: SourceStatus.processing, updatedAt: { lt: cutoff }, deletedAt: null },
    select: { id: true, notebookId: true, processingAttempts: true },
    take: 50,
  })

  let recovered = 0
  for (const source of stuck) {
    if (source.processingAttempts < MAX_RECOVERY_ATTEMPTS) {
      const claimed = await prisma.source.updateMany({
        where: { id: source.id, status: SourceStatus.processing },
        data: {
          status: SourceStatus.queued,
          processingAttempts: { increment: 1 },
          progress: 0,
          updatedAt: new Date(),
        },
      })
      if (claimed.count > 0) {
        await enqueueIngestion({ sourceId: source.id }, source.processingAttempts + 2).catch((err) =>
          log.error({ sourceId: source.id, err: (err as Error).message }, 'stuck-source requeue failed')
        )
        invalidateSourceListCache(source.notebookId)
        recovered++
      }
    } else {
      await prisma.source.updateMany({
        where: { id: source.id, status: SourceStatus.processing },
        data: { status: SourceStatus.failed, processingError: 'STUCK_PROCESSING', progress: 0 },
      })
      invalidateSourceListCache(source.notebookId)
      invalidateRetrievalCache(source.notebookId)
    }
  }

  if (recovered > 0 || stuck.length > 0) {
    log.info({ stuck: stuck.length, recovered }, 'stuck sources processed')
  }
  return recovered
}

async function removeOrphanedFiles(): Promise<number> {
  const root = uploadRoot()
  const notebookDirs = await readdir(root, { withFileTypes: true }).catch(() => [])
  let removed = 0
  let checked = 0

  for (const dir of notebookDirs) {
    if (!dir.isDirectory() || checked >= MAX_FILES_PER_RUN) continue
    const files = await readdir(join(root, dir.name)).catch(() => [])

    for (const file of files) {
      if (checked >= MAX_FILES_PER_RUN) break
      checked++
      const fullPath = join(root, dir.name, file)

      const info = await stat(fullPath).catch(() => null)
      if (!info?.isFile() || Date.now() - info.mtimeMs < ORPHAN_GRACE_MS) continue

      // A live source reference keeps the file (paths are absolute in DB)
      const referenced = await prisma.source.findFirst({
        where: { filePath: fullPath, deletedAt: null },
        select: { id: true },
      })
      if (referenced) continue

      await unlink(fullPath).catch(() => undefined)
      removed++
    }
  }

  if (removed > 0) log.info({ removed }, 'orphaned upload files removed')
  return removed
}

async function purgeExpiredSources(): Promise<number> {
  const cutoff = new Date(Date.now() - SOURCE_RETENTION_MS)

  const expired = await prisma.source.findMany({
    where: { deletedAt: { lt: cutoff } },
    select: { id: true, filePath: true },
    take: 100,
  })

  for (const source of expired) {
    if (source.filePath) {
      await unlink(source.filePath).catch(() => undefined)
    }
    await prisma.source.delete({ where: { id: source.id } }).catch(() => undefined)
  }

  if (expired.length > 0) log.info({ purged: expired.length }, 'retention window purged sources')
  return expired.length
}

export async function runCleanup(): Promise<{ recovered: number; orphansRemoved: number; purged: number }> {
  const recovered = await recoverStuckSources()
  const orphansRemoved = await removeOrphanedFiles()
  const purged = await purgeExpiredSources()
  return { recovered, orphansRemoved, purged }
}

export function startCleanupWorker(): Worker<CleanupJobData> {
  const worker = new Worker<CleanupJobData>(QUEUES.cleanup, async (job: Job<CleanupJobData>) => runCleanup(), {
    connection: bullmqConnection,
    concurrency: 1,
    lockDuration: 5 * 60_000,
  })

  worker.on('failed', (job, err) => log.error({ jobId: job?.id, err: err.message }, 'cleanup job failed'))
  worker.on('error', (err) => log.error({ err: err.message }, 'cleanup worker error'))
  log.info('Cleanup worker started')
  return worker
}
