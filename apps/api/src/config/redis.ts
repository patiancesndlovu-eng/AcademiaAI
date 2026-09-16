import Redis from 'ioredis'
import { env } from './env'
import { logger } from '../utils/logger'

const log = logger.child({ component: 'redis' })

/**
 * Redis is a performance layer only — PostgreSQL remains the source of truth
 * (spec Rule 3). Every cache consumer must degrade gracefully when Redis is
 * unreachable, so the cache client swallows connection errors after logging.
 */

export const cacheRedis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 2,
  enableOfflineQueue: false,
  lazyConnect: true, // connect on first command, not at import time
  retryStrategy: (times) => Math.min(times * 500, 5000),
})

// BullMQ requires maxRetriesPerRequest: null (jobs must not fail on
// transient Redis hiccups); queues get their own dedicated connections.
export const bullmqConnection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
})

cacheRedis.on('error', (err) => {
  log.warn({ err: err.message }, 'Redis cache unavailable — falling back to database')
})

bullmqConnection.on('error', (err) => {
  log.error({ err: err.message }, 'Redis queue connection error')
})

export async function isRedisHealthy(): Promise<boolean> {
  try {
    // lazyConnect client: establish the connection on first probe instead of
    // failing the ping while the socket is still coming up
    if (cacheRedis.status === 'wait' || cacheRedis.status === 'reconnecting') {
      await Promise.resolve(cacheRedis.connect()).catch(() => undefined)
    }
    const pong = await cacheRedis.ping()
    return pong === 'PONG'
  } catch {
    return false
  }
}

/** Fire-and-forget warm-up so the first real request hits a ready client. */
export function warmCacheConnection(): void {
  Promise.resolve(cacheRedis.connect()).catch(() => {
    log.warn('Redis not reachable at boot — cache will connect lazily and fail open')
  })
}

export async function disconnectRedis(): Promise<void> {
  await Promise.allSettled([cacheRedis.quit(), bullmqConnection.quit()])
}
