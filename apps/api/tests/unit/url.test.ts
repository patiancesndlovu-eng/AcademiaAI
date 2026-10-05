import { describe, it, expect } from 'vitest'
import { extractDomain, isSafeHttpUrl, normalizeCanonicalUrl } from '../../src/utils/url'

describe('extractDomain', () => {
  it('returns the hostname', () => {
    expect(extractDomain('https://example.com/article?q=1')).toBe('example.com')
  })

  it('returns empty string for garbage', () => {
    expect(extractDomain('not a url')).toBe('')
  })
})

describe('isSafeHttpUrl', () => {
  it('accepts http and https', () => {
    expect(isSafeHttpUrl('https://example.com/a')).toBe(true)
    expect(isSafeHttpUrl('http://example.com/a')).toBe(true)
  })

  it('rejects dangerous schemes and garbage', () => {
    expect(isSafeHttpUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeHttpUrl('data:text/html,hi')).toBe(false)
    expect(isSafeHttpUrl('file:///etc/passwd')).toBe(false)
    expect(isSafeHttpUrl('not a url')).toBe(false)
    expect(isSafeHttpUrl('')).toBe(false)
  })
})

describe('normalizeCanonicalUrl', () => {
  it('lowercases the host and strips trailing slashes', () => {
    expect(normalizeCanonicalUrl('https://Example.COM/Article/')).toBe('https://example.com/Article')
  })

  it('strips default ports but keeps custom ones', () => {
    expect(normalizeCanonicalUrl('https://example.com:443/a')).toBe('https://example.com/a')
    expect(normalizeCanonicalUrl('http://example.com:8080/a')).toBe('http://example.com:8080/a')
  })

  it('preserves path and query — they may identify different articles', () => {
    expect(normalizeCanonicalUrl('https://example.com/a?utm_source=x')).toBe('https://example.com/a?utm_source=x')
  })

  it('treats trailing-slash variants as the same URL', () => {
    expect(normalizeCanonicalUrl('https://example.com/a/')).toBe(normalizeCanonicalUrl('https://example.com/a'))
  })

  it('returns null for dangerous or unparsable URLs', () => {
    expect(normalizeCanonicalUrl('javascript:alert(1)')).toBeNull()
    expect(normalizeCanonicalUrl('data:text/html,hi')).toBeNull()
    expect(normalizeCanonicalUrl('not a url')).toBeNull()
  })
})
