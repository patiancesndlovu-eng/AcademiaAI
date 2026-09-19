import { Request, Response, NextFunction } from 'express'
import { logger } from '../utils/logger'

const httpLog = logger.child({ component: 'http' })

/** Structured request logging replacing morgan (spec §85). */
export function requestLoggingMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = process.hrtime.bigint()

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'
    httpLog[level](
      {
        requestId: req.requestId,
        userId: req.user?.id,
        method: req.method,
        route: req.originalUrl,
        status: res.statusCode,
        durationMs: Math.round(durationMs * 10) / 10,
      },
      'http_request'
    )
  })

  next()
}
