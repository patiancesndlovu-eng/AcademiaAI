import { Request, Response, NextFunction } from 'express'
import { error } from '../utils/response'
import { randomUUID } from 'crypto'

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  const requestId = randomUUID()
  console.error(`[${requestId}]`, err)

  if ((err as any).name === 'UnauthorizedError') {
    return res.status(401).json(error('UNAUTHORIZED', 'Authentication required', false, requestId))
  }

  // Prisma errors
  if ((err as any).name === 'PrismaClientKnownRequestError') {
    const code = (err as any).code
    if (code === 'P2002') {
      return res.status(409).json(error('CONFLICT', 'Resource already exists', false, requestId))
    }
    if (code === 'P2025') {
      return res.status(404).json(error('NOT_FOUND', 'Resource not found', false, requestId))
    }
  }

  res.status(500).json(error('INTERNAL_ERROR', 'Something went wrong', true, requestId))
}