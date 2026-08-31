import { Request, Response, NextFunction } from 'express'
import { error } from '../utils/response'

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  const requestId = req.requestId || 'req_unknown'
  console.error(`[${requestId}]`, err)

  // Clerk / JWT unauthorized
  if ((err as any).name === 'UnauthorizedError') {
    return res.status(401).json(error('UNAUTHORIZED', 'Authentication required', false, requestId))
  }

  // Zod validation (fallback if not caught earlier)
  if ((err as any).name === 'ZodError') {
    const messages = (err as any).issues?.map((i: any) => `${i.path.join('.')}: ${i.message}`).join(', ')
    return res.status(400).json(error('VALIDATION_ERROR', messages || 'Invalid input', false, requestId))
  }

  // Prisma known errors
  if ((err as any).name === 'PrismaClientKnownRequestError') {
    const code = (err as any).code
    if (code === 'P2002') {
      return res.status(409).json(error('CONFLICT', 'Resource already exists', false, requestId))
    }
    if (code === 'P2025') {
      return res.status(404).json(error('NOT_FOUND', 'Resource not found', false, requestId))
    }
    if (code === 'P2003') {
      return res.status(409).json(error('CONSTRAINT_VIOLATION', 'Related resource does not exist', false, requestId))
    }
    if (code === 'P2024') {
      return res.status(504).json(error('TIMEOUT', 'Database query timed out', true, requestId))
    }
  }

  // Prisma validation errors
  if ((err as any).name === 'PrismaClientValidationError') {
    return res.status(400).json(error('VALIDATION_ERROR', 'Invalid query parameters', false, requestId))
  }

  // Default 500 — not retryable by default (retryable only for true transient failures)
  res.status(500).json(error('INTERNAL_ERROR', 'Something went wrong', false, requestId))
}