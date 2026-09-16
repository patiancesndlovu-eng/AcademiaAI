import { randomUUID } from 'crypto'
import { createHash } from 'crypto'
import type { Redis } from 'ioredis'
import { cacheRedis } from '../config/redis'
import { logger } from '../utils/logger'

const log = logger.child({ component: 'cache' })

const LOCK_TTL_MS = 10_000
const LOCK_RETRY_MS = 75
const LOCK_MAX_WAIT_MS = 5_000

export function hashKey(...parts: string[]): string {
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 24)
}

/**
 * Cache-aside read-through with stampede protection (spec §45/§50):
 * on a miss, one caller acquires a short-lived lock and loads from the
 * database while the rest poll the cache, then fall through to the DB anyway
 * if the lock holder stalls.
 *
 * Redis failures never break the request path: on any Redis error the loader
 * simply runs against the database.
 */
export async function getOrSet<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
  try {
    const cached = await cacheRedis.get(key)
    if (cached) {
      return JSON.parse(cached) as T
    }
  } catch {
    // Redis unavailable → bypass cache entirely
    return loader()
  }

  const lockKey = `lock:${key}`
  const lockValue = randomUUID()
  const deadline = Date.now() + LOCK_MAX_WAIT_MS

  for (;;) {
    let acquired: 'OK' | null = null
    try {
      acquired = await cacheRedis.set(lockKey, lockValue, 'PX', LOCK_TTL_MS, 'NX')
    } catch {
      return loader()
    }

    if (acquired === 'OK') break

    if (Date.now() >= deadline) {
      // Lock holder stalled — serve from the database rather than block
      return loader()
    }
    await sleep(LOCK_RETRY_MS)
  }

  try {
    // Double-check: another request may have populated the cache while we waited
    try {
      const cached = await cacheRedis.get(key)
      if (cached) return JSON.parse(cached) as T
    } catch {
      /* fall through to loader */
    }

    const value = await loader()
    try {
      // Only JSON-safe values are ever cached (spec §51)
      await cacheRedis.set(key, JSON.stringify(value), 'EX', ttlSeconds)
    } catch {
      /* cache write failure is non-fatal */
    }
    return value
  } finally {
    releaseLock(lockKey, lockValue)
  }
}

async function releaseLock(lockKey: string, lockValue: string): Promise<void> {
  try {
    // Release only if we still own the lock (watch/multi transaction)
    const current = await cacheRedis.get(lockKey)
    if (current === lockValue) {
      await cacheRedis.del(lockKey)
    }
  } catch {
    /* lock expires on its own */
  }
}

/**
 * Invalidate cache keys after a committed database mutation (spec §49/§144).
 * Failures are logged and retried best-effort; short TTLs bound staleness.
 */
export async function invalidateKeys(...keys: string[]): Promise<void> {
  if (keys.length === 0) return
  try {
    await cacheRedis.del(...keys)
  } catch (err) {
    log.warn({ err: (err as Error).message, keys }, 'Cache invalidation failed (TTL will recover)')
  }
}

/** Invalidate by prefix scan (used for notebooks:* families). */
export async function invalidateByPrefix(prefix: string, redis: Redis = cacheRedis): Promise<void> {
  try {
    let cursor = '0'
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 200)
      cursor = next
      if (keys.length > 0) await redis.del(...keys)
    } while (cursor !== '0')
  } catch (err) {
    log.warn({ err: (err as Error).message, prefix }, 'Prefix invalidation failed')
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
