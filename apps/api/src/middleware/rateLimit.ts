import { Request, Response, NextFunction } from 'express'
import rateLimit, { ipKeyGenerator, type Options } from 'express-rate-limit'
import { RedisStore, type RedisReply } from 'rate-limit-redis'
import { cacheRedis } from '../config/redis'
import { rateLimited } from '../utils/errors'

/**
 * Redis-backed, tiered rate limiting (spec §68/§69).
 *
 * Tiers are constructed lazily on first use: express-rate-limit loads its
 * LUA scripts into Redis at middleware construction, which races the Redis
 * connection during boot. If Redis is unavailable, passOnStoreError lets
 * requests through (fail open) — Redis is a limiter, not a gatekeeper.
 */

function makeStore(prefix: string) {
  return new RedisStore({
    sendCommand: (...args: string[]) =>
      (cacheRedis.call as unknown as (...a: string[]) => Promise<unknown>)(...args) as Promise<RedisReply>,
    prefix: `ratelimit:${prefix}:`,
  })
}

function keyByUserOrIp(req: Request): string {
  if (req.user?.id) return `u:${req.user.id}`
  return `ip:${ipKeyGenerator(req.ip ?? 'unknown')}`
}

function jsonHandler() {
  return (req: Request, res: { status: (n: number) => { json: (b: unknown) => void } }) => {
    const err = rateLimited()
    res.status(err.statusCode).json({
      data: null,
      meta: { requestId: (req as unknown as { requestId?: string }).requestId ?? 'req_unknown' },
      error: { code: err.code, message: err.message, retryable: err.retryable },
    })
  }
}

interface TierOptions {
  windowMs: number
  max: number
  prefix: string
  keyByUser?: boolean
}

function buildTier({ windowMs, max, prefix, keyByUser = true }: TierOptions) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    passOnStoreError: true,
    store: makeStore(prefix),
    keyGenerator: keyByUser
      ? keyByUserOrIp
      : (req: Request) => ipKeyGenerator(req.ip ?? 'unknown'),
    handler: jsonHandler(),
  } as unknown as Options)
}

/** Lazy memoized tier: the real limiter is created on first request. */
function lazyTier(options: TierOptions) {
  let instance: ReturnType<typeof rateLimit> | null = null
  const middleware = (req: Request, res: Response, next: NextFunction) => {
    instance ??= buildTier(options)
    return instance(req, res, next)
  }
  return middleware
}

/** Global infra guard — generous; user tiers do the real work. */
export const globalLimiter = lazyTier({ windowMs: 15 * 60_000, max: 1_000, prefix: 'global', keyByUser: false })

export const authLimiter = lazyTier({ windowMs: 15 * 60_000, max: 50, prefix: 'auth', keyByUser: false })

/** Expensive/abusable endpoints get strict per-user limits (spec §69). */
export const chatLimiter = lazyTier({ windowMs: 60_000, max: 20, prefix: 'chat' })
export const uploadLimiter = lazyTier({ windowMs: 60 * 60_000, max: 30, prefix: 'upload' })
export const urlIngestionLimiter = lazyTier({ windowMs: 60 * 60_000, max: 20, prefix: 'urlingest' })
export const retryLimiter = lazyTier({ windowMs: 60 * 60_000, max: 30, prefix: 'retry' })
export const searchLimiter = lazyTier({ windowMs: 60_000, max: 20, prefix: 'search' })
