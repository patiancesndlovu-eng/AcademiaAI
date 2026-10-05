import { z } from 'zod'

/** Canonical source selection: required, deduped, deterministically ordered. */
export const sourceIdsSchema = z
  .array(z.string().cuid())
  .min(1, 'Select at least one source')
  .max(50)
  .transform((ids) => [...new Set(ids)].sort())

export const quizConfigSchema = z.object({
  questionCount: z.coerce.number().int().min(5).max(50).default(10),
  difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
  topic: z.string().trim().max(200).optional(),
})

export const flashcardsConfigSchema = z.object({
  count: z.coerce.number().int().min(5).max(100).default(20),
})

export const summaryConfigSchema = z.object({
  length: z.enum(['short', 'medium', 'long']).default('medium'),
  topic: z.string().trim().max(200).optional(),
})

export const reportConfigSchema = z.object({
  length: z.enum(['short', 'medium', 'long']).default('medium'),
  focus: z.string().max(200).optional(),
})

export const mindmapConfigSchema = z.object({
  maxNodes: z.coerce.number().int().min(10).max(200).default(50),
  depth: z.coerce.number().int().min(1).max(5).default(3),
})

/** Single canonical generation request contract: type + sourceIds + config. */
export const generationConfigSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('quiz'), sourceIds: sourceIdsSchema, config: quizConfigSchema }),
  z.object({ type: z.literal('flashcards'), sourceIds: sourceIdsSchema, config: flashcardsConfigSchema }),
  z.object({ type: z.literal('summary'), sourceIds: sourceIdsSchema, config: summaryConfigSchema }),
  z.object({ type: z.literal('report'), sourceIds: sourceIdsSchema, config: reportConfigSchema }),
  z.object({ type: z.literal('mindmap'), sourceIds: sourceIdsSchema, config: mindmapConfigSchema }),
])

export type QuizConfig = z.infer<typeof quizConfigSchema>
export type FlashcardsConfig = z.infer<typeof flashcardsConfigSchema>
export type SummaryConfig = z.infer<typeof summaryConfigSchema>
export type ReportConfig = z.infer<typeof reportConfigSchema>
export type MindmapConfig = z.infer<typeof mindmapConfigSchema>
export type GenerationConfig = z.infer<typeof generationConfigSchema>