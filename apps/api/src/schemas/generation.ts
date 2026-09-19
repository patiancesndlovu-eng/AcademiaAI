import { z } from 'zod'

export const quizConfigSchema = z.object({
  questionCount: z.number().int().min(5).max(50).default(10),
  difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
})

export const flashcardsConfigSchema = z.object({
  count: z.number().int().min(5).max(100).default(20),
})

export const summaryConfigSchema = z.object({
  length: z.enum(['short', 'medium', 'long']).default('medium'),
})

export const reportConfigSchema = z.object({
  length: z.enum(['short', 'medium', 'long']).default('medium'),
  focus: z.string().max(200).optional(),
})

export const mindmapConfigSchema = z.object({
  maxNodes: z.number().int().min(10).max(200).default(50),
  depth: z.number().int().min(1).max(5).default(3),
})

export const generationConfigSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('quiz'), config: quizConfigSchema }),
  z.object({ type: z.literal('flashcards'), config: flashcardsConfigSchema }),
  z.object({ type: z.literal('summary'), config: summaryConfigSchema }),
  z.object({ type: z.literal('report'), config: reportConfigSchema }),
  z.object({ type: z.literal('mindmap'), config: mindmapConfigSchema }),
])

export type QuizConfig = z.infer<typeof quizConfigSchema>
export type FlashcardsConfig = z.infer<typeof flashcardsConfigSchema>
export type SummaryConfig = z.infer<typeof summaryConfigSchema>
export type ReportConfig = z.infer<typeof reportConfigSchema>
export type MindmapConfig = z.infer<typeof mindmapConfigSchema>
export type GenerationConfig = z.infer<typeof generationConfigSchema>