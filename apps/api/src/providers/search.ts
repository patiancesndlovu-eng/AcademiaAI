import { env } from '../config/env'
import { logger } from '../utils/logger'
import { getOrSet } from '../cache/cache'
import { cacheKeys, cacheTtls } from '../cache/keys'
import { AppError, externalServiceError } from '../utils/errors'

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
 * Whether server-side web search is available. The endpoint answers 503
 * SEARCH_DISABLED when false so the UI never mistakes "unconfigured"
 * for "no results".
 */
export function isSearchConfigured(): boolean {
  return Boolean(env.SERP_API_KEY)
}

/** Single organic result → SearchResult, or null when the item is unusable. */
function toSearchResult(r: any): SearchResult | null {
  try {
    const url = typeof r.link === 'string' ? r.link : ''
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    return {
      title: (r.title ?? 'Untitled').toString().slice(0, 200),
      url,
      domain: parsed.hostname,
      snippet: (r.snippet ?? '').toString().slice(0, 300),
      retrievedAt: new Date().toISOString(),
    }
  } catch {
    return null
  }
}

/**
 * Search provider (spec §40/§79/§100). Uses SerpAPI when configured,
 * falls back to a no-op that returns empty results. Results are cached
 * to control cost (spec §100).
 *
 * Failures throw distinct AppErrors (never silent []) so callers can tell
 * "no results" apart from "provider failed". The chat caller catches these
 * and continues with local context.
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

      const results: SearchResult[] = []
      for (const r of organic.slice(0, 8)) {
        const parsed = toSearchResult(r)
        if (parsed) results.push(parsed)
      }
      return results
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        throw new AppError('SEARCH_TIMEOUT', 'Search request timed out', 504, true)
      }
      if (err instanceof AppError) throw err
      log.error({ err: (err as Error).message, query: normalized }, 'Web search failed')
      throw new AppError('SEARCH_PROVIDER_ERROR', 'Search provider failed', 502, true)
    }
  })
}