export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

/** Only http(s) URLs may become sources — never javascript:, data:, file:, etc. */
export function isSafeHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim())
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Canonical form for duplicate detection: lowercase host, strip default
 * ports and trailing slashes. Path and query are preserved — they may
 * identify genuinely different articles.
 */
export function normalizeCanonicalUrl(url: string): string | null {
  try {
    const parsed = new URL(url.trim())
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    const host = parsed.hostname.toLowerCase()
    const isDefaultPort =
      (parsed.protocol === 'http:' && parsed.port === '80') ||
      (parsed.protocol === 'https:' && parsed.port === '443')
    const port = parsed.port && !isDefaultPort ? `:${parsed.port}` : ''
    let path = parsed.pathname
    if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1)
    return `${parsed.protocol}//${host}${port}${path}${parsed.search}${parsed.hash}`
  } catch {
    return null
  }
}