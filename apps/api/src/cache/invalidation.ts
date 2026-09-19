import { createHash } from 'crypto'
import { cacheRedis } from '../config/redis'
import { cacheKeys } from './keys'
import { invalidateByPrefix, invalidateKeys } from './cache'

/**
 * Cache invalidation points tied to database mutations (spec §49).
 * These run AFTER the DB write commits (spec §144).
 */

export function invalidateNotebookCache(notebookId: string, ownerId?: string): void {
  const keys = [cacheKeys.notebook(notebookId), cacheKeys.notebookMembers(notebookId)]
  if (ownerId) keys.push(cacheKeys.userProfile(ownerId))
  void invalidateKeys(...keys)
  void invalidateByPrefix(`cache:notebook:${notebookId}:sources:`)
  void invalidateByPrefix(`cache:notebook:list:${ownerId || 'all'}:`)
  invalidateRetrievalCache(notebookId)
}

export function invalidateNotebookListCache(userId: string): void {
  void invalidateByPrefix(`cache:notebook:list:${userId}:`)
}

export function invalidateSourceListCache(notebookId: string): void {
  void invalidateByPrefix(`cache:notebook:${notebookId}:sources:`)
}

/**
 * Any source change (create/select/delete/status change) can change retrieval
 * results, so retrieval entries rotate via a per-notebook version embedded in
 * the key — cheaper and more correct than scanning/query-hash enumeration.
 */
export function invalidateRetrievalCache(notebookId: string): void {
  const versionKey = `cache:retrieval:${notebookId}:__version`
  void (async () => {
    try {
      await cacheRedis.incr(versionKey)
      await cacheRedis.expire(versionKey, 86_400)
    } catch {
      /* retrieval cache TTL is short — staleness self-heals */
    }
  })()
}

/** Retrieval cache key including the notebook's retrieval version. */
export async function retrievalKey(notebookId: string, query: string, selectionSeed: string): Promise<string> {
  let version = '0'
  try {
    version = (await cacheRedis.get(`cache:retrieval:${notebookId}:__version`)) || '0'
  } catch {
    /* fall back to v0 — TTL is short */
  }
  const queryHash = createHash('sha256').update(query).digest('hex').slice(0, 16)
  const selectionHash = createHash('sha256').update(selectionSeed).digest('hex').slice(0, 16)
  return cacheKeys.retrieval(notebookId, `${queryHash}:v${version}`, selectionHash)
}
