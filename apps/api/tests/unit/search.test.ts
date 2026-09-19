import { describe, it, expect, vi, beforeEach } from 'vitest'
import { searchWeb } from '../../src/providers/search'

vi.mock('../../src/config/env', () => ({
  env: { SERP_API_KEY: 'test-key' },
}))

vi.mock('../../src/cache/cache', () => ({
  getOrSet: vi.fn(async (_key: string, _ttl: number, loader: () => Promise<any>) => loader()),
}))

vi.mock('../../src/cache/keys', () => ({
  cacheKeys: { webSearch: (q: string) => `cache:websearch:${q}` },
  cacheTtls: { webSearchSec: 300 },
}))

vi.mock('../../src/utils/logger', () => ({
  logger: {
    child: () => ({
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}))

describe('search provider (spec §40/§100)', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('returns empty array for empty query', async () => {
    const results = await searchWeb('   ')
    expect(results).toEqual([])
  })

  it('returns empty array when SERP_API_KEY not configured', async () => {
    vi.doMock('../../src/config/env', () => ({ env: { SERP_API_KEY: undefined } }))
    const { searchWeb: searchWebNoKey } = await import('../../src/providers/search')
    const results = await searchWebNoKey('test query')
    expect(results).toEqual([])
  })

  it('normalizes query for cache key', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ organic_results: [] }),
    })) as unknown as typeof fetch)
    try {
      const { getOrSet } = await import('../../src/cache/cache')
      await searchWeb('Test Query')
      expect(getOrSet).toHaveBeenCalledWith('cache:websearch:test query', 300, expect.any(Function))
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('skips unusable results instead of failing the batch', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        organic_results: [
          { title: 'Good article', link: 'https://example.com/a', snippet: 'A snippet' },
          { title: 'Dangerous', link: 'javascript:alert(1)', snippet: 'x' },
          { title: 'No link', snippet: 'y' },
        ],
      }),
    })) as unknown as typeof fetch)
    try {
      const results = await searchWeb('usable results')
      expect(results).toHaveLength(1)
      expect(results[0]).toMatchObject({ title: 'Good article', domain: 'example.com' })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('throws SEARCH_TIMEOUT instead of silent [] when the provider aborts', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      const err = new Error('The operation was aborted')
      err.name = 'AbortError'
      throw err
    }) as unknown as typeof fetch)
    try {
      await expect(searchWeb('timeout query')).rejects.toMatchObject({ code: 'SEARCH_TIMEOUT', statusCode: 504 })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('throws SEARCH_PROVIDER_ERROR instead of silent [] on provider failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('boom')
    }) as unknown as typeof fetch)
    try {
      await expect(searchWeb('failing query')).rejects.toMatchObject({ code: 'SEARCH_PROVIDER_ERROR', statusCode: 502 })
    } finally {
      vi.unstubAllGlobals()
    }
  })
})