/**
 * Application error with a stable machine-readable code, HTTP status and
 * retryability hint. Client-facing errors must use this (or be mapped to it)
 * so responses never leak internals (stacks, provider payloads, paths).
 */
export class AppError extends Error {
  readonly code: string
  readonly statusCode: number
  readonly retryable: boolean
  readonly details?: unknown

  constructor(code: string, message: string, statusCode: number, retryable = false, details?: unknown) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.statusCode = statusCode
    this.retryable = retryable
    this.details = details
  }
}

export const badRequest = (message = 'Invalid request', details?: unknown) =>
  new AppError('BAD_REQUEST', message, 400, false, details)

export const validationError = (message: string, details?: unknown) =>
  new AppError('VALIDATION_ERROR', message, 400, false, details)

export const unauthorized = (message = 'Authentication required') =>
  new AppError('UNAUTHORIZED', message, 401, false)

export const forbidden = (message = 'Access denied') =>
  new AppError('FORBIDDEN', message, 403, false)

export const notFound = (message = 'Resource not found') =>
  new AppError('NOT_FOUND', message, 404, false)

export const conflict = (message = 'Resource already exists') =>
  new AppError('CONFLICT', message, 409, false)

export const payloadTooLarge = (message = 'Payload too large') =>
  new AppError('PAYLOAD_TOO_LARGE', message, 413, false)

export const unsupportedMediaType = (message = 'Unsupported media type') =>
  new AppError('UNSUPPORTED_MEDIA_TYPE', message, 415, false)

export const rateLimited = (message = 'Too many requests, please slow down.') =>
  new AppError('RATE_LIMITED', message, 429, true)

export const externalServiceError = (message = 'An external service failed', retryable = true) =>
  new AppError('EXTERNAL_SERVICE_ERROR', message, 502, retryable)

export const storageError = (message = 'Storage operation failed', retryable = true) =>
  new AppError('STORAGE_ERROR', message, 502, retryable)

export const processingError = (message: string, retryable = true) =>
  new AppError('PROCESSING_ERROR', message, 500, retryable)

export const serviceUnavailable = (message = 'Service temporarily unavailable') =>
  new AppError('SERVICE_UNAVAILABLE', message, 503, true)

export const internalError = (message = 'Something went wrong') =>
  new AppError('INTERNAL_ERROR', message, 500, false)
