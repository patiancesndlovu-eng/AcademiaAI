import { Queue } from 'bullmq'
import { bullmqConnection } from '../config/redis'
import { QUEUES, IngestionJobData, CleanupJobData, GenerationJobData } from './jobTypes'

/**
 * Queue producers (API side). Workers live in src/workers and run as a
 * separate process (spec §89) — importing this module does not start one.
 */

export const ingestionQueue = new Queue<IngestionJobData>(QUEUES.ingestion, {
  connection: bullmqConnection,
})

export const cleanupQueue = new Queue<CleanupJobData>(QUEUES.cleanup, {
  connection: bullmqConnection,
})

export const generationQueue = new Queue<GenerationJobData>(QUEUES.generation, {
  connection: bullmqConnection,
})

/**
 * Enqueue ingestion for a source. jobId is derived from the source id plus
 * its attempt cycle so duplicate create/retry requests collapse onto one job
 * (spec §16/§55) while a retry after failure gets a fresh job.
 * (BullMQ forbids ':' in custom ids — cuids contain none, so '-' is safe.)
 */
export async function enqueueIngestion(
  data: IngestionJobData,
  attemptCycle: number
): Promise<void> {
  await ingestionQueue.add('ingest', data, {
    jobId: `${data.sourceId}-a${attemptCycle}`,
    attempts: 4,
    backoff: { type: 'exponential', delay: 5_000 },
    removeOnComplete: { age: 3_600 },
    removeOnFail: { age: 86_400 },
  })
}

/**
 * Enqueue a generation job. jobId = GenerationJob.id ensures exactly-once
 * semantics — duplicate requests with same jobId are deduplicated by BullMQ.
 */
export async function enqueueGeneration(data: GenerationJobData): Promise<void> {
  await generationQueue.add('generate', data, {
    jobId: data.jobId,
    attempts: 3,
    backoff: { type: 'exponential', delay: 10_000 },
    removeOnComplete: { age: 3_600 },
    removeOnFail: { age: 86_400 },
  })
}

export async function closeQueues(): Promise<void> {
  await Promise.allSettled([ingestionQueue.close(), cleanupQueue.close(), generationQueue.close()])
}