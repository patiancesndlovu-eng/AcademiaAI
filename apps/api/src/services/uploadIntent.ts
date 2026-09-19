import { cacheRedis } from '../config/redis'
import { env } from '../config/env'
import * as storage from './storage'
import { kindFromMimeType, detectFileKind, DetectedKind } from '../utils/magicBytes'
import { badRequest, payloadTooLarge, serviceUnavailable, unsupportedMediaType } from '../utils/errors'

/**
 * Upload intent registry (spec §24): the client declares what it intends to
 * upload; the backend validates the declaration, reserves a server-generated
 * storage path (never client-influenced, spec §139/§140) and records the
 * intent in Redis with a TTL. The internal upload endpoint only accepts
 * writes for a registered, unconsumed intent — this replaces the previous
 * trust-the-client `?path=` handler.
 */

export interface UploadIntent {
  notebookId: string
  userId: string
  originalName: string
  declaredSize: number
  kind: Exclude<DetectedKind, null>
  consumed: boolean
}

const keyFor = (filePath: string) => `uploadintent:${filePath}`

export interface UploadIntentResult {
  filePath: string
  uploadUrl: string
}

export async function createUploadIntent(
  notebookId: string,
  userId: string,
  input: { filename: string; contentType: string; size: number }
): Promise<UploadIntentResult> {
  const kind = kindFromMimeType(input.contentType)
  if (!kind) {
    throw unsupportedMediaType('Unsupported file type. Allowed: PDF, PNG, JPG, WEBP, TXT')
  }
  if (input.size > env.MAX_FILE_SIZE) {
    throw payloadTooLarge(`File exceeds the maximum size of ${Math.floor(env.MAX_FILE_SIZE / 1024 / 1024)} MB`)
  }

  const safeName = storage.sanitizeFilename(input.filename)
  const filePath = storage.generatePath(notebookId, safeName, kind)

  const intent: UploadIntent = {
    notebookId,
    userId,
    originalName: input.filename.slice(0, 255),
    declaredSize: input.size,
    kind,
    consumed: false,
  }

  try {
    await cacheRedis.set(keyFor(filePath), JSON.stringify(intent), 'EX', env.UPLOAD_INTENT_TTL_SECONDS)
  } catch (err) {
    throw serviceUnavailable('Upload registry unavailable, please retry')
  }

  return {
    filePath,
    uploadUrl: `/api/v1/internal/upload?path=${encodeURIComponent(filePath)}`,
  }
}

/**
 * Validate an uploaded buffer against its registered intent: same user,
 * not consumed, size within bounds, and magic bytes matching the declared
 * kind (spec §22). Marks the intent consumed on success.
 */
export async function consumeIntentForUpload(
  filePath: string,
  userId: string,
  buffer: Buffer
): Promise<UploadIntent> {
  const raw = await getIntent(filePath)
  if (!raw) {
    throw badRequest('No active upload intent for this path — request a new upload URL')
  }
  if (raw.userId !== userId) {
    throw badRequest('This upload URL was issued to another session')
  }
  if (raw.consumed) {
    throw badRequest('This upload URL has already been used')
  }
  if (buffer.length > env.MAX_FILE_SIZE) {
    throw payloadTooLarge('File exceeds the maximum allowed size')
  }
  if (buffer.length === 0) {
    throw badRequest('Uploaded file is empty')
  }

  const detected = detectFileKind(buffer)
  if (detected !== raw.kind) {
    throw unsupportedMediaType('File contents do not match the declared file type')
  }

  storage.saveFile(filePath, buffer)

  const consumed: UploadIntent = { ...raw, consumed: true }
  await cacheRedis.set(keyFor(filePath), JSON.stringify(consumed), 'EX', env.UPLOAD_INTENT_TTL_SECONDS)
  return consumed
}

/** Verify an upload was actually completed before creating the source (spec §24). */
export async function verifyUploadCompletion(filePath: string, userId: string): Promise<UploadIntent> {
  const intent = await getIntent(filePath)
  if (!intent || intent.userId !== userId) {
    throw badRequest('No active upload intent for this path — restart the upload')
  }
  if (!intent.consumed) {
    throw badRequest('Upload has not completed yet')
  }
  if (!storage.fileExists(filePath)) {
    throw badRequest('Uploaded file is missing — restart the upload')
  }
  return intent
}

async function getIntent(filePath: string): Promise<UploadIntent | null> {
  let raw: string | null
  try {
    raw = await cacheRedis.get(keyFor(filePath))
  } catch (err) {
    throw serviceUnavailable('Upload registry unavailable, please retry')
  }
  if (!raw) return null
  try {
    return JSON.parse(raw) as UploadIntent
  } catch {
    return null
  }
}
