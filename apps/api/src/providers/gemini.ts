import { GoogleGenAI } from '@google/genai'
import { env } from '../config/env'
import { logger } from '../utils/logger'
import { AppError, externalServiceError, serviceUnavailable } from '../utils/errors'

const log = logger.child({ component: 'gemini' })

/**
 * Gemini provider (spec §35/§79/§80). All external-call policy lives here:
 * timeouts, retry classification, a circuit breaker and structured logging.
 * Business logic never touches the SDK directly.
 */

const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY })

// ─── Error classification (spec §35) ───

export interface GeminiFailure {
  retryable: boolean
  code: string
  message: string
}

export function classifyGeminiError(err: unknown): GeminiFailure {
  const anyErr = err as { status?: number; name?: string; message?: string }

  if (anyErr?.name === 'AbortError' || /aborted|timeout/i.test(anyErr?.message ?? '')) {
    return { retryable: true, code: 'AI_TIMEOUT', message: 'The AI provider timed out' }
  }
  if (anyErr?.status === 429) {
    return { retryable: true, code: 'AI_RATE_LIMITED', message: 'The AI provider is rate limiting requests' }
  }
  if ((anyErr?.status ?? 0) >= 500) {
    return { retryable: true, code: 'AI_PROVIDER_ERROR', message: 'The AI provider had a transient failure' }
  }
  if (anyErr?.status === 400 || anyErr?.status === 404) {
    return { retryable: false, code: 'AI_BAD_REQUEST', message: 'The AI request was rejected' }
  }
  if (anyErr?.status === 401 || anyErr?.status === 403) {
    return { retryable: false, code: 'AI_AUTH_ERROR', message: 'The AI provider rejected the credentials' }
  }
  if (/safety|blocked|prohibited/i.test(anyErr?.message ?? '')) {
    return { retryable: false, code: 'AI_SAFETY_REFUSAL', message: 'The AI provider declined to answer' }
  }
  if (anyErr?.status !== undefined) {
    return { retryable: false, code: 'AI_REQUEST_ERROR', message: 'The AI request failed' }
  }
  // Unknown shape — most likely a network-level failure
  return { retryable: true, code: 'AI_NETWORK_ERROR', message: 'Could not reach the AI provider' }
}

export function geminiFailureToAppError(err: unknown): AppError {
  const failure = classifyGeminiError(err)
  return externalServiceError(failure.message, failure.retryable)
}

// ─── Circuit breaker (spec §80) ───

const BREAKER_THRESHOLD = 5
const BREAKER_COOLDOWN_MS = 30_000
const breaker = { consecutiveFailures: 0, openUntil: 0 }

function breakerCheck(): void {
  if (Date.now() < breaker.openUntil) {
    throw serviceUnavailable('AI provider temporarily unavailable')
  }
}

function breakerRecordSuccess(): void {
  breaker.consecutiveFailures = 0
}

function breakerRecordFailure(): void {
  breaker.consecutiveFailures += 1
  if (breaker.consecutiveFailures >= BREAKER_THRESHOLD) {
    breaker.openUntil = Date.now() + BREAKER_COOLDOWN_MS
    breaker.consecutiveFailures = 0
    log.warn('Gemini circuit breaker opened for 30s')
  }
}

// ─── Timeout + retry wrapper ───

function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), env.GEMINI_TIMEOUT_MS)
  return fn(controller.signal).finally(() => clearTimeout(timer))
}

const RETRYABLE_ATTEMPTS = 2 // 1 initial + 2 retries
const RETRY_DELAYS_MS = [1_000, 5_000]

export async function callWithPolicy<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  breakerCheck()

  let lastError: unknown
  for (let attempt = 0; attempt <= RETRYABLE_ATTEMPTS; attempt++) {
    try {
      const result = await withTimeout(fn)
      breakerRecordSuccess()
      return result
    } catch (err) {
      lastError = err
      const failure = classifyGeminiError(err)
      log.warn({ attempt, code: failure.code, retryable: failure.retryable }, 'Gemini call failed')
      if (!failure.retryable || attempt === RETRYABLE_ATTEMPTS) break
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt] ?? 5_000))
    }
  }

  breakerRecordFailure()
  throw geminiFailureToAppError(lastError)
}

// ─── Chat streaming ───

export interface ChatStreamOptions {
  systemInstruction: string
  /** Serialized conversation (user question + optional recent history). */
  contents: string
  temperature?: number
  maxOutputTokens?: number
  /** External abort (client disconnect) layered on top of the timeout. */
  signal?: AbortSignal
}

export interface ChatStreamChunk {
  text: string
  usage?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number }
}

/**
 * Streams a grounded chat completion. Yields text deltas; the final yield
 * may carry usage metadata.
 */
export async function* streamChat(options: ChatStreamOptions): AsyncGenerator<ChatStreamChunk> {
  breakerCheck()

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), env.GEMINI_TIMEOUT_MS * 4) // streaming gets a longer budget
  const onExternalAbort = () => controller.abort()
  options.signal?.addEventListener('abort', onExternalAbort, { once: true })

  try {
    const stream = await ai.models.generateContentStream({
      model: env.GEMINI_CHAT_MODEL,
      contents: options.contents,
      config: {
        systemInstruction: options.systemInstruction,
        temperature: options.temperature ?? 0.3,
        maxOutputTokens: options.maxOutputTokens ?? 4096,
        abortSignal: controller.signal,
      },
    })

    for await (const chunk of stream) {
      const meta = chunk.usageMetadata
      const usage = meta
        ? {
            promptTokenCount: meta.promptTokenCount,
            candidatesTokenCount: meta.candidatesTokenCount,
            totalTokenCount: meta.totalTokenCount,
          }
        : undefined
      yield { text: chunk.text ?? '', usage }
    }
    breakerRecordSuccess()
  } catch (err) {
    const failure = classifyGeminiError(err)
    if (!failure.retryable) breakerRecordFailure()
    else breakerRecordSuccess() // circuit tracks provider health, not client aborts
    if (options.signal?.aborted) {
      throw new AppError('CLIENT_DISCONNECTED', 'Client disconnected', 499, false)
    }
    throw geminiFailureToAppError(err)
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', onExternalAbort)
  }
}

// ─── Single-shot generation (OCR transcription, later: structured outputs) ───

export interface GenerateOptions {
  prompt: string
  systemInstruction?: string
  /** Inline file payload (base64, no data: prefix) for multimodal requests. */
  inlineData?: { mimeType: string; data: string }
  model?: 'chat' | 'vision'
  temperature?: number
}

export async function generateText(options: GenerateOptions): Promise<string> {
  const model = options.model === 'vision' || options.inlineData ? env.GEMINI_VISION_MODEL : env.GEMINI_CHAT_MODEL

  return callWithPolicy(async (signal) => {
    const contents = options.inlineData
      ? [options.prompt, { inlineData: options.inlineData }]
      : options.prompt

    const response = await ai.models.generateContent({
      model,
      contents: contents as never,
      config: {
        systemInstruction: options.systemInstruction,
        temperature: options.temperature ?? 0.1,
        abortSignal: signal,
      },
    })
    return response.text ?? ''
  })
}
