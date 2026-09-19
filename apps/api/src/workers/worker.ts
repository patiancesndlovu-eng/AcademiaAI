import dotenv from 'dotenv'
import { cleanupQueue, generationQueue, closeQueues } from '../queues/queues'
import { QUEUES } from '../queues/jobTypes'
import { startIngestionWorker } from './ingestion.worker'
import { startCleanupWorker } from './cleanup.worker'
import { startGenerationWorker } from './generation.worker'
import { prisma } from '../config/db'
import { disconnectRedis } from '../config/redis'
import { logger } from '../utils/logger'

/**
 * Worker process entry (spec §89) — runs separately from the HTTP API:
 *   pnpm --filter @academia-ai/api dev:worker
 */

dotenv.config()

const log = logger.child({ component: 'worker-entry' })

async function main(): Promise<void> {
  const ingestionWorker = startIngestionWorker()
  const cleanupWorker = startCleanupWorker()
  const generationWorker = startGenerationWorker()

  // Idempotent repeatable schedule: BullMQ upserts the scheduler definition
  await cleanupQueue.upsertJobScheduler('scheduled-cleanup', { every: 5 * 60_000 }, {
    name: 'scheduled-cleanup',
    data: { scheduled: true },
    opts: { removeOnComplete: { count: 10 }, removeOnFail: { count: 10 } },
  })

  log.info({ queues: [QUEUES.ingestion, QUEUES.cleanup, QUEUES.generation] }, 'Worker process ready')

  const shutdown = async (signal: string) => {
    log.info({ signal }, 'Worker shutting down gracefully...')
    const forceExit = setTimeout(() => process.exit(1), 30_000)
    forceExit.unref()

    await Promise.allSettled([ingestionWorker.close(), cleanupWorker.close(), generationWorker.close()])
    await closeQueues()
    await disconnectRedis()
    await prisma.$disconnect()
    log.info('Worker stopped')
    process.exit(0)
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))
}

main().catch((err) => {
  log.error({ err: (err as Error).stack }, 'Worker failed to start')
  process.exit(1)
})