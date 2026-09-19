import { Request, Response, NextFunction } from 'express'
import { AppError } from '../utils/errors'
import { error } from '../utils/response'
import { logger } from '../utils/logger'
import { env } from '../config/env'

const log = logger.child({ component: 'errorHandler' })

/**
 * Single exit point for failures. Client responses carry a stable code,
 * sanitized message and retryability hint (spec §75/§76); internals (stacks,
 * provider payloads, SQL) stay in logs only.
 */
export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  const requestId = req.requestId || 'req_unknown'

  if (res.headersSent) {
    log.warn({ requestId }, 'Error after headers sent; aborting connection')
    res.end()
    return
  }

  // Application errors with an explicit contract
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      log.error({ requestId, err, code: err.code }, err.message)
    }
    const body = error(err.code, err.message, err.retryable, requestId)
    if (!env.isProd && err.details !== undefined) {
      ;(body.error as { details?: unknown }).details = err.details
    }
    return res.status(err.statusCode).json(body)
  }

  // Multer upload errors
  if ((err as { name?: string }).name === 'MulterError') {
    const multerErr = err as unknown as { code: string; message: string }
    if (multerErr.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json(error('PAYLOAD_TOO_LARGE', 'File exceeds the maximum allowed size', false, requestId))
    }
    return res.status(400).json(error('BAD_REQUEST', 'Upload failed', false, requestId))
  }

  // Zod validation (fallback when not caught by validateRequest)
  if ((err as { name?: string }).name === 'ZodError') {
    const issues = (err as { issues?: { path: (string | number)[]; message: string }[] }).issues ?? []
    const messages = issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')
    return res.status(400).json(error('VALIDATION_ERROR', messages || 'Invalid input', false, requestId))
  }

  // Prisma known errors → stable HTTP semantics (spec §66)
  if ((err as { name?: string }).name === 'PrismaClientKnownRequestError') {
    const code = (err as unknown as { code: string }).code
    if (code === 'P2002') {
      return res.status(409).json(error('CONFLICT', 'Resource already exists', false, requestId))
    }
    if (code === 'P2025') {
      return res.status(404).json(error('NOT_FOUND', 'Resource not found', false, requestId))
    }
    if (code === 'P2003') {
      return res.status(409).json(error('CONFLICT', 'Related resource does not exist', false, requestId))
    }
    if (code === 'P2024') {
      return res.status(503).json(error('SERVICE_UNAVAILABLE', 'Database is busy, try again shortly', true, requestId))
    }
    log.error({ requestId, err, prismaCode: code }, 'Prisma error')
    return res.status(500).json(error('DATABASE_ERROR', 'Database operation failed', true, requestId))
  }

  if ((err as { name?: string }).name === 'PrismaClientValidationError') {
    log.error({ requestId, err }, 'Prisma validation error (likely a code bug)')
    return res.status(500).json(error('INTERNAL_ERROR', 'Something went wrong', false, requestId))
  }

  log.error({ requestId, err }, 'Unhandled error')
  res.status(500).json(error('INTERNAL_ERROR', 'Something went wrong', false, requestId))
}
