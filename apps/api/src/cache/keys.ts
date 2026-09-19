/**
 * Deterministic, namespaced cache keys (spec §44/§47).
 * Never mix these namespaces: cache:*, ratelimit:*, lock:*, uploadintent:*.
 */
import { createHash } from 'crypto'

export const cacheKeys = {
  userProfile: (userId: string) => `cache:user:${userId}`,
  notebook: (notebookId: string) => `cache:notebook:${notebookId}`,
  notebookMembers: (notebookId: string) => `cache:notebook:${notebookId}:members`,
  notebookList: (userId: string, scope: string, sort: string, search?: string) => {
    const searchHash = search ? createHash('sha256').update(search).digest('hex').slice(0, 16) : 'none'
    return `cache:notebook:list:${userId}:${scope}:${sort}:${searchHash}`
  },
  notebookSources: (notebookId: string, page: number, pageSize: number) =>
    `cache:notebook:${notebookId}:sources:${page}:${pageSize}`,
  output: (outputId: string) => `cache:output:${outputId}`,
  retrieval: (notebookId: string, queryHash: string, selectionHash: string) =>
    `cache:retrieval:${notebookId}:${queryHash}:${selectionHash}`,
  webSearch: (normalizedQuery: string) => `cache:websearch:${normalizedQuery}`,
}

export const cacheTtls = {
  userProfileSec: 300, // 5 min
  notebookSec: 120, // 2 min
  notebookListSec: 60, // 1 min
  membershipSec: 60,
  sourcesSec: 45,
  retrievalSec: 90,
  webSearchSec: 300,
} as const