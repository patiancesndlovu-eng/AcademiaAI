import { Request, Response, NextFunction } from 'express'
import { randomUUID } from 'crypto'

declare global {
  namespace Express {
    interface Request {
      requestId: string
    }
  }
}

/**
 * Assigns a request id (or honors a client-provided X-Request-ID) and echoes
 * it on the response. The id propagates into logs, error envelopes and
 * async job metadata (spec §15).
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const provided = req.get('x-request-id')
  req.requestId = provided && provided.length <= 128 ? provided : `req_${randomUUID()}`
  res.setHeader('X-Request-ID', req.requestId)
  next()
}
