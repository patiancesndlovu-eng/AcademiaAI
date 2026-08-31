import { Request, Response, NextFunction } from 'express'
import { randomUUID } from 'crypto'

declare global {
  namespace Express {
    interface Request {
      requestId: string
    }
  }
}

export function requestIdMiddleware(req: Request, _res: Response, next: NextFunction) {
  req.requestId = (req.get('x-request-id') as string) || randomUUID()
  next()
}