import 'dotenv/config'
import { z } from 'zod'
import { existsSync, mkdirSync } from 'fs'
import { resolve } from 'path'

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  CLERK_SECRET_KEY: z.string().min(1),
  CLERK_PUBLISHABLE_KEY: z.string().min(1),
  GEMINI_API_KEY: z.string().min(1),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  PORT: z.string().default('5000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  UPLOAD_DIR: z.string().default('./uploads'),
  FRONTEND_URL: z.string().default('http://localhost:5173'),
  MAX_FILE_SIZE: z.string().default('10485760'),

  // AI providers
  GEMINI_CHAT_MODEL: z.string().default('gemini-2.5-flash'),
  GEMINI_VISION_MODEL: z.string().default('gemini-2.5-flash'),
  GEMINI_TIMEOUT_MS: z.string().default('45000'),

  // Retrieval bounds
  RETRIEVAL_TOP_K: z.string().default('10'),
  CONTEXT_MAX_CHARS: z.string().default('24000'),

  // Web ingestion
  WEB_FETCH_TIMEOUT_MS: z.string().default('10000'),
  WEB_FETCH_MAX_BYTES: z.string().default('5242880'), // 5 MB
  WEB_FETCH_MAX_REDIRECTS: z.string().default('3'),

  // Search (SerpAPI)
  SERP_API_KEY: z.string().optional(),

  // Upload intents (local-storage stand-in for signed S3 URLs)
  UPLOAD_INTENT_TTL_SECONDS: z.string().default('900'),

  // Observability
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
})

const parsed = envSchema.parse(process.env)

// Ensure upload directory exists
const uploadDir = resolve(parsed.UPLOAD_DIR)

if (!existsSync(uploadDir)) {
  mkdirSync(uploadDir, { recursive: true })
}

function int(value: string, fallback: number): number {
  const n = parseInt(value, 10)
  return Number.isFinite(n) ? n : fallback
}

export const env = {
  ...parsed,
  PORT: int(parsed.PORT, 5000),
  MAX_FILE_SIZE: int(parsed.MAX_FILE_SIZE, 10485760),
  UPLOAD_DIR: uploadDir,
  GEMINI_TIMEOUT_MS: int(parsed.GEMINI_TIMEOUT_MS, 45000),
  RETRIEVAL_TOP_K: int(parsed.RETRIEVAL_TOP_K, 10),
  CONTEXT_MAX_CHARS: int(parsed.CONTEXT_MAX_CHARS, 24000),
  WEB_FETCH_TIMEOUT_MS: int(parsed.WEB_FETCH_TIMEOUT_MS, 10000),
  WEB_FETCH_MAX_BYTES: int(parsed.WEB_FETCH_MAX_BYTES, 5242880),
  WEB_FETCH_MAX_REDIRECTS: int(parsed.WEB_FETCH_MAX_REDIRECTS, 3),
  UPLOAD_INTENT_TTL_SECONDS: int(parsed.UPLOAD_INTENT_TTL_SECONDS, 900),
  isProd: parsed.NODE_ENV === 'production',
}
