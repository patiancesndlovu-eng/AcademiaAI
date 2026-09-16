import { env } from '../config/env'
import { logger } from '../utils/logger'
import { getOrSet } from '../cache/cache'
import { cacheKeys, cacheTtls } from '../cache/keys'
import { externalServiceError } from '../utils/errors'

const log = logger.child({ component: 'search' })

export interface SearchResult {
  title: string
  url: string
  domain: string
  snippet: string
  retrievedAt: string
}

export interface SearchResponse {
  results: SearchResult[]
  query: string
}

/**
 * Search provider (spec §40/§79/§100). Uses SerpAPI when configured,
 * falls back to a no-op that returns empty results. Results are cached
 * to control cost (spec §100).
 */
export async function searchWeb(query: string): Promise<SearchResult[]> {
  const normalized = query.trim().toLowerCase().slice(0, 200)
  if (!normalized) return []

  const cacheKey = cacheKeys.webSearch(normalized)

  return getOrSet(cacheKey, cacheTtls.webSearchSec, async () => {
    const apiKey = env.SERP_API_KEY
    if (!apiKey) {
      log.warn('SERP_API_KEY not configured — web search disabled')
      return []
    }

    try {
      const params = new URLSearchParams({
        q: normalized,
        api_key: apiKey,
        engine: 'google',
        num: '8',
        safe: 'active',
      })

      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 10_000)

      const res = await fetch(`https://serpapi.com/search.json?${params}`, {
        signal: controller.signal,
      })

      clearTimeout(timer)

      if (!res.ok) {
        throw externalServiceError(`Search API returned ${res.status}`, res.status >= 500)
      }

      const data = (await res.json()) as { organic_results?: any[] }
      const organic = data.organic_results ?? []

      return organic.slice(0, 8).map((r) => ({
        title: r.title?.slice(0, 200) ?? 'Untitled',
        url: r.link ?? '',
        domain: new URL(r.link ?? 'about:blank').hostname,
        snippet: r.snippet?.slice(0, 300) ?? '',
        retrievedAt: new Date().toISOString(),
      }))
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        throw externalServiceError('Search request timed out', true)
      }
      log.error({ err: (err as Error).message, query: normalized }, 'Web search failed')
      return []
    }
  })
}