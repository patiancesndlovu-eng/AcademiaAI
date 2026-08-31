import 'dotenv/config'
import { z } from 'zod'
import { existsSync, mkdirSync } from 'fs'
import { resolve } from 'path'

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  CLERK_SECRET_KEY: z.string().min(1),
  CLERK_PUBLISHABLE_KEY: z.string().min(1),
  GEMINI_API_KEY: z.string().optional(),
  PORT: z.string().default('5000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  UPLOAD_DIR: z.string().default('./uploads'),
  FRONTEND_URL: z.string().default('http://localhost:5173'),
  MAX_FILE_SIZE: z.string().default('10485760'),
})

const parsed = envSchema.parse(process.env)

// Ensure upload directory exists
const uploadDir = resolve(parsed.UPLOAD_DIR)

if (!existsSync(uploadDir)) {
  mkdirSync(uploadDir, { recursive: true })
}

export const env = {
  ...parsed,
  PORT: parseInt(parsed.PORT, 10),
  MAX_FILE_SIZE: parseInt(parsed.MAX_FILE_SIZE, 10),
  UPLOAD_DIR: uploadDir,
}