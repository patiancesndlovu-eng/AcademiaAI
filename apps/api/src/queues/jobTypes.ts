/** BullMQ job payload contracts shared by API (producers) and workers. */

export interface IngestionJobData {
  sourceId: string
  /** Correlation id from the originating HTTP request (spec §149). */
  requestId?: string
  userId?: string
}

export interface CleanupJobData {
  scheduled?: boolean
}

export interface GenerationJobData {
  jobId: string
  notebookId: string
  requestedBy: string
  requestId?: string
}

export const QUEUES = {
  ingestion: 'ingestion',
  cleanup: 'cleanup',
  generation: 'generation',
} as const