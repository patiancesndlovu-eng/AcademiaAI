import { Job, UnrecoverableError, Worker } from 'bullmq'
import { GenerationStatus, GenerationType } from '@prisma/client'
import { prisma } from '../config/db'
import { bullmqConnection } from '../config/redis'
import { QUEUES, GenerationJobData } from '../queues/jobTypes'
import { invalidateSourceListCache, invalidateRetrievalCache } from '../cache/invalidation'
import * as chatService from '../services/chat'
import { retrieveChunks } from '../services/retrieval'
import { generateText } from '../providers/gemini'
import { logger } from '../utils/logger'
import { AppError } from '../utils/errors'

/**
 * Generation worker (spec §59/§60/§63). Processes quiz, flashcards, summary,
 * report and mindmap jobs. Uses structured prompts per type; validates
 * Gemini JSON output via Zod before persisting Output + Job transactionally.
 */

const log = logger.child({ component: 'generation-worker' })

// ─── Structured output schemas (validated post-generation) ───

const quizQuestionSchema = z.object({
  question: z.string().min(1).max(500),
  options: z.array(z.string().min(1).max(200)).length(4),
  correctIndex: z.number().int().min(0).max(3),
  explanation: z.string().max(1000).optional(),
  citations: z.array(z.number().int().min(1)).optional(),
})

const quizOutputSchema = z.object({
  questions: z.array(quizQuestionSchema).min(1).max(50),
  metadata: z.object({
    topic: z.string().max(200),
    difficulty: z.enum(['easy', 'medium', 'hard']),
  }),
})

const flashcardSchema = z.object({
  front: z.string().min(1).max(500),
  back: z.string().min(1).max(1000),
  citations: z.array(z.number().int().min(1)).optional(),
})

const flashcardsOutputSchema = z.object({
  cards: z.array(flashcardSchema).min(1).max(100),
})

const summaryOutputSchema = z.object({
  summary: z.string().min(1).max(10000),
  keyPoints: z.array(z.string().max(500)).max(20).optional(),
  citations: z.array(z.number().int().min(1)).optional(),
})

const reportOutputSchema = z.object({
  title: z.string().min(1).max(200),
  sections: z.array(
    z.object({
      heading: z.string().max(200),
      content: z.string().max(5000),
      citations: z.array(z.number().int().min(1)).optional(),
    })
  ).min(1).max(20),
})

const mindmapNodeSchema: z.ZodTypeAny = z.object({
  id: z.string().max(50),
  label: z.string().max(100),
  children: z.array(z.lazy(() => mindmapNodeSchema)).optional(),
  citations: z.array(z.number().int().min(1)).optional(),
})

const mindmapOutputSchema = z.object({
  root: mindmapNodeSchema,
})

// ─── System prompts per generation type ───

const QUIZ_SYSTEM = [
  'You are an expert educator creating quiz questions from study material.',
  'Generate multiple-choice questions with exactly 4 options each.',
  'Questions must be grounded in the provided source material — cite block numbers [n] for each question.',
  'Return ONLY valid JSON matching the schema.',
].join('\n')

const FLASHCARDS_SYSTEM = [
  'You are creating flashcards for active recall study.',
  'Each card has a concise front (question/term) and detailed back (answer/definition).',
  'Content must come from the source material — cite block numbers [n].',
  'Return ONLY valid JSON matching the schema.',
].join('\n')

const SUMMARY_SYSTEM = [
  'You are writing a concise, well-structured summary of the provided material.',
  'Include key points and cite source blocks [n] for factual claims.',
  'Return ONLY valid JSON matching the schema.',
].join('\n')

const REPORT_SYSTEM = [
  'You are writing a structured report/essay from the source material.',
  'Organize into logical sections with headings. Cite sources [n] per section.',
  'Return ONLY valid JSON matching the schema.',
].join('\n')

const MINDMAP_SYSTEM = [
  'You are creating a hierarchical mind map from the source material.',
  'Each node has a label and optional children. Cite sources [n] where relevant.',
  'Keep depth reasonable (max 3-4 levels). Return ONLY valid JSON matching the schema.',
].join('\n')

const SYSTEM_PROMPTS: Record<GenerationType, string> = {
  quiz: QUIZ_SYSTEM,
  flashcards: FLASHCARDS_SYSTEM,
  summary: SUMMARY_SYSTEM,
  report: REPORT_SYSTEM,
  mindmap: MINDMAP_SYSTEM,
}

const OUTPUT_SCHEMAS: Record<GenerationType, z.ZodTypeAny> = {
  quiz: quizOutputSchema,
  flashcards: flashcardsOutputSchema,
  summary: summaryOutputSchema,
  report: reportOutputSchema,
  mindmap: mindmapOutputSchema,
}

// ─── Helpers ───

function buildGenerationPrompt(jobType: GenerationType, context: chatService.PromptContext, config: any): string {
  const configInstructions = getConfigInstructions(jobType, config)
  const blocks = context.blocks.join('\n\n')

  return [
    `TASK: Generate a ${jobType.toUpperCase()} from the source material below.`,
    configInstructions,
    '',
    'SOURCE MATERIAL',
    '----------------',
    blocks,
    '----------------',
    '',
    'Return ONLY valid JSON matching the expected schema.',
  ].join('\n')
}

function getConfigInstructions(jobType: GenerationType, config: any): string {
  switch (jobType) {
    case 'quiz':
      return `Create exactly ${config.questionCount} questions at ${config.difficulty} difficulty.`
    case 'flashcards':
      return `Create exactly ${config.count} flashcards.`
    case 'summary':
      return `Write a ${config.length} summary. short=~150 words, medium=~300 words, long=~600 words.`
    case 'report':
      return `Write a ${config.length} report${config.focus ? ` focused on: ${config.focus}` : ''}.`
    case 'mindmap':
      return `Create a mind map with up to ${config.maxNodes} nodes, max depth ${config.depth}.`
    default:
      return ''
  }
}

async function validateOutput(jobType: GenerationType, jsonText: string): Promise<any> {
  const schema = OUTPUT_SCHEMAS[jobType]
  const parsed = JSON.parse(jsonText)
  return schema.parse(parsed)
}

// ─── Job processor ───

async function setProgress(jobId: string, progress: number): Promise<void> {
  await prisma.generationJob
    .update({ where: { id: jobId }, data: { progress, updatedAt: new Date() } })
    .catch(() => undefined)
}

async function markFailed(jobId: string, code: string): Promise<void> {
  await prisma.generationJob
    .update({
      where: { id: jobId },
      data: { status: GenerationStatus.failed, error: code.slice(0, 200), progress: 0, updatedAt: new Date() },
    })
    .catch(() => undefined)
}

export async function processGenerationJob(job: Job<GenerationJobData>): Promise<{ status: string }> {
  const { jobId, notebookId, requestedBy } = job.data

  const dbJob = await prisma.generationJob.findUnique({
    where: { id: jobId },
    select: { id: true, notebookId: true, type: true, config: true, status: true, requestedBy: true },
  })

  if (!dbJob) return { status: 'not-found' }
  if (dbJob.status === GenerationStatus.completed) return { status: 'already-done' }
  if (dbJob.status === GenerationStatus.cancelled) return { status: 'cancelled' }

  // Guarded claim: only transition queued → processing once
  if (dbJob.status === GenerationStatus.queued) {
    const claimed = await prisma.generationJob.updateMany({
      where: { id: jobId, status: GenerationStatus.queued },
      data: { status: GenerationStatus.processing, progress: 10, updatedAt: new Date() },
    })
    if (claimed.count === 0) return { status: 'claimed-elsewhere' }
  } else if (dbJob.status === GenerationStatus.processing && job.attemptsMade === 0) {
    return { status: 'claimed-elsewhere' }
  } else if (dbJob.status === GenerationStatus.failed) {
    return { status: 'stale' }
  }

  try {
    await setProgress(jobId, 20)

    // Retrieve relevant chunks (spec §30/§31) — use all selected ready sources
    const chunks = await retrieveChunks({ notebookId, query: '', sourceIds: null })
    if (chunks.length === 0) {
      await markFailed(jobId, 'NO_SOURCES_SELECTED')
      throw new UnrecoverableError('NO_SOURCES_SELECTED')
    }

    await setProgress(jobId, 40)

    const context = chatService.buildContextBlocks(chunks)
    const prompt = buildGenerationPrompt(dbJob.type, context, dbJob.config)
    const systemInstruction = SYSTEM_PROMPTS[dbJob.type]

    await setProgress(jobId, 60)

    // Call Gemini with structured output
    const rawOutput = await generateText({
      prompt,
      systemInstruction,
      model: 'chat',
      temperature: 0.2,
    })

    await setProgress(jobId, 80)

    // Validate JSON output (spec §36)
    const validated = await validateOutput(dbJob.type, rawOutput)

    await setProgress(jobId, 90)

    // Persist Output + update Job atomically (spec §63)
    await prisma.$transaction(async (tx) => {
      const fresh = await tx.generationJob.findUnique({ where: { id: jobId }, select: { status: true } })
      if (!fresh || fresh.status === GenerationStatus.cancelled) {
        throw new UnrecoverableError('JOB_CANCELLED')
      }

      const output = await tx.output.create({
        data: {
          notebookId,
          jobId,
          type: dbJob.type,
          title: getOutputTitle(dbJob.type, validated),
          content: validated as never,
        },
      })

      await tx.generationJob.update({
        where: { id: jobId },
        data: {
          status: GenerationStatus.completed,
          progress: 100,
          outputId: output.id,
          updatedAt: new Date(),
        },
      })
    })

    invalidateSourceListCache(notebookId)
    invalidateRetrievalCache(notebookId)

    await setProgress(jobId, 100)
    log.info({ jobId, notebookId, type: dbJob.type }, 'generation_completed')
    return { status: 'completed' }
  } catch (err) {
    const attempt = job.attemptsMade + 1
    const maxAttempts = job.opts.attempts ?? 1

    if (err instanceof UnrecoverableError) {
      await markFailed(jobId, err.message)
      throw err
    }
    if (err instanceof z.ZodError) {
      await markFailed(jobId, 'INVALID_AI_OUTPUT')
      log.warn({ jobId, err: err.errors }, 'AI output validation failed')
      throw new UnrecoverableError('INVALID_AI_OUTPUT')
    }
    if (err instanceof AppError && !err.retryable) {
      await markFailed(jobId, err.code)
      throw new UnrecoverableError(err.code)
    }

    if (attempt >= maxAttempts) {
      await markFailed(jobId, 'GENERATION_FAILED')
    } else {
      log.warn({ jobId, attempt, err: (err as Error).message }, 'generation attempt failed, retrying')
    }
    throw err
  }
}

function getOutputTitle(type: GenerationType, validated: any): string {
  switch (type) {
    case 'quiz':
      return validated.metadata?.topic || 'Quiz'
    case 'flashcards':
      return 'Flashcards'
    case 'summary':
      return 'Summary'
    case 'report':
      return validated.title || 'Report'
    case 'mindmap':
      return 'Mind Map'
    default:
      return 'Output'
  }
}

export function startGenerationWorker(): Worker<GenerationJobData> {
  const worker = new Worker<GenerationJobData>(QUEUES.generation, processGenerationJob, {
    connection: bullmqConnection,
    concurrency: 2,
    lockDuration: 120_000,
    stalledInterval: 30_000,
    maxStalledCount: 3,
  })

  worker.on('failed', async (job, err) => {
    if (!job) return
    log.error({ jobId: job.id, generationJobId: job.data.jobId, err: err.message }, 'generation job failed')
    // Safety net: never leave a job stuck in processing after final failure
    await prisma.generationJob
      .updateMany({
        where: { id: job.data.jobId, status: GenerationStatus.processing },
        data: { status: GenerationStatus.failed, error: 'GENERATION_FAILED', progress: 0 },
      })
      .catch(() => undefined)
  })

  worker.on('error', (err) => log.error({ err: err.message }, 'generation worker error'))
  log.info('Generation worker started')
  return worker
}

// ─── Zod import ───
import { z } from 'zod'