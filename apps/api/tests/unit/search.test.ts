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
})