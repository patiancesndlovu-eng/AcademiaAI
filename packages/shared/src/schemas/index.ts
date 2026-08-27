import { z } from 'zod'

export const createNotebookSchema = z.object({ title: z.string().min(1).max(200), description: z.string().max(2000).optional() })
export const updateNotebookSchema = z.object({ title: z.string().min(1).max(200).optional(), description: z.string().max(2000).optional(), visibility: z.enum(['private','shared','public']).optional() })
export const addUrlSourceSchema = z.object({ url: z.string().url() })
export const addTextSourceSchema = z.object({ title: z.string().min(1).max(200), text: z.string().min(1).max(50000) })
export const sendMessageSchema = z.object({ message: z.string().min(1).max(5000), sourceIds: z.array(z.string()).optional(), mode: z.enum(['grounded','web_enhanced']).default('grounded') })
export const createGenerationSchema = z.object({ type: z.enum(['quiz','flashcards','summary','report','mindmap']), sourceIds: z.array(z.string()), config: z.record(z.any()) })
