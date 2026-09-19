import { isIP } from 'net'
import { lookup } from 'dns/promises'
import { env } from '../config/env'
import { AppError, badRequest, externalServiceError } from './errors'

/**
 * SSRF-safe HTTP fetcher for user-supplied URLs.
 *
 * Defenses (spec §41/§43):
 *  - http/https only, standard ports only
 *  - DNS is resolved and every resulting IP is validated (blocks private,
 *    loopback, link-local/metadata, CGNAT, multicast and reserved ranges)
 *  - IP-literal hosts are validated directly
 *  - redirects are followed manually and revalidated on every hop
 *  - content-type, total byte cap and wall-clock timeout are enforced
 */

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])
const ALLOWED_PORTS = new Set(['', '80', '443', '8080', '8443'])

class FetchLimitError extends Error {}

export interface SafeFetchResult {
  body: string
  finalUrl: string
  contentType: string
  bytes: number
}

function ipv4ToLong(ip: string): number {
  const parts = ip.split('.').map(Number)
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0
}

function isPrivateIPv4(ip: string): boolean {
  const n = ipv4ToLong(ip)
  const inCidr = (base: string, bits: number) => (n >>> (32 - bits)) === (ipv4ToLong(base) >>> (32 - bits))
  return (
    ip === '0.0.0.0' ||
    inCidr('0.0.0.0', 8) || // "this" network
    inCidr('10.0.0.0', 8) || // private
    inCidr('127.0.0.0', 8) || // loopback
    inCidr('169.254.0.0', 16) || // link-local incl. cloud metadata 169.254.169.254
    inCidr('172.16.0.0', 12) || // private
    inCidr('192.168.0.0', 16) || // private
    inCidr('100.64.0.0', 10) || // CGNAT
    inCidr('198.18.0.0', 15) || // benchmarking
    inCidr('224.0.0.0', 4) || // multicast
    inCidr('240.0.0.0', 4) // reserved
  )
}

function isPrivateIPv6(ip: string): boolean {
  const addr = ip.toLowerCase().split('%')[0]
  // IPv4-mapped (::ffff:a.b.c.d) — evaluate the embedded v4 address
  const mapped = addr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) return isPrivateIPv4(mapped[1])
  if (addr === '::' || addr === '::1') return true

  // Expand to full 32-hex-digit form (handles "::" compression)
  const expand = (h: string): string => {
    let head = h
    let tail = ''
    if (h.includes('::')) {
      const [a, b = ''] = h.split('::')
      head = a
      tail = b
    }
    const headGroups = head ? head.split(':') : []
    const tailGroups = tail ? tail.split(':') : []
    const missing = 8 - headGroups.length - tailGroups.length
    const groups = [...headGroups, ...Array(Math.max(0, missing)).fill('0'), ...tailGroups]
    return groups.map((g) => g.padStart(4, '0')).join('')
  }

  const full = expand(addr)
  const b = (i: number) => parseInt(full.slice(i * 2, i * 2 + 2), 16)

  // fc00::/7 (unique local): first 7 bits → 0xfc–0xfd
  if (b(0) >= 0xfc && b(0) <= 0xfd) return true
  // fe80::/10 (link-local): fe80–febf
  if (b(0) === 0xfe && b(1) >= 0x80 && b(1) <= 0xbf) return true
  // ff00::/8 (multicast)
  if (b(0) === 0xff) return true
  // 2001:db8::/32 (documentation)
  if (b(0) === 0x20 && b(1) === 0x01 && b(2) === 0x0d && b(3) === 0xb8) return true
  return false
}

export function isPrivateAddress(ip: string): boolean {
  const family = isIP(ip)
  if (family === 4) return isPrivateIPv4(ip)
  if (family === 6) return isPrivateIPv6(ip)
  return true // unparseable → treat as unsafe
}

/**
 * Validates a URL and resolves its host, guaranteeing the resolved IP is public.
 * Returns the canonical origin-safe URL to fetch.
 */
export async function assertSafeUrl(rawUrl: string): Promise<URL> {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw badRequest('Malformed URL')
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw badRequest('Only http and https URLs are supported')
  }
  if (!ALLOWED_PORTS.has(url.port)) {
    throw badRequest('Non-standard ports are not allowed')
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '')

  if (isIP(hostname) !== 0) {
    if (isPrivateAddress(hostname)) throw badRequest('Requests to internal addresses are not allowed')
    return url
  }

  // Internal-looking hostnames are rejected even before DNS (spec §41)
  const lower = hostname.toLowerCase()
  if (lower === 'localhost' || lower.endsWith('.localhost') || lower.endsWith('.local') || lower.endsWith('.internal')) {
    throw badRequest('Requests to internal addresses are not allowed')
  }

  let addresses: { address: string; family: number }[]
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true })
  } catch {
    throw badRequest('Could not resolve host')
  }

  if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) {
    throw badRequest('Requests to internal addresses are not allowed')
  }

  return url
}

async function readBodyWithCap(res: Response, maxBytes: number): Promise<string> {
  const reader = res.body?.getReader()
  if (!reader) return ''

  const decoder = new TextDecoder('utf-8', { fatal: false })
  let received = 0
  let text = ''

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    received += value.byteLength
    if (received > maxBytes) {
      reader.cancel().catch(() => {})
      throw new FetchLimitError(`Response exceeded ${maxBytes} bytes`)
    }
    text += decoder.decode(value, { stream: true })
  }
  text += decoder.decode()
  return text
}

/**
 * Fetches a user-supplied URL with SSRF checks, redirect revalidation,
 * content-type filtering, byte cap and timeout.
 */
export async function safeFetchText(rawUrl: string): Promise<SafeFetchResult> {
  let currentUrl = await assertSafeUrl(rawUrl)
  const maxRedirects = env.WEB_FETCH_MAX_REDIRECTS

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), env.WEB_FETCH_TIMEOUT_MS)

    let res: Response
    try {
      res = await fetch(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; AcademiaAI/1.0; +https://academiaai.app)',
          Accept: 'text/html,text/plain,application/xhtml+xml;q=0.9,*/*;q=0.1',
        },
      })
    } catch (err) {
      clearTimeout(timer)
      if ((err as Error).name === 'AbortError') {
        throw externalServiceError('The page took too long to respond', true)
      }
      throw externalServiceError('The page could not be fetched', true)
    }
    clearTimeout(timer)

    // Redirects: revalidate the next hop from scratch (anti DNS-rebinding, spec §41)
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location')
      if (!location) throw externalServiceError('The page returned an invalid redirect', false)
      if (hop === maxRedirects) throw externalServiceError('Too many redirects', false)
      try {
        currentUrl = await assertSafeUrl(new URL(location, currentUrl).toString())
      } catch (err) {
        if (err instanceof AppError) throw err
        throw badRequest('The page redirected to an invalid URL')
      }
      continue
    }

    if (!res.ok) {
      throw externalServiceError(`The page responded with status ${res.status}`, res.status >= 500)
    }

    const contentType = (res.headers.get('content-type') || '').toLowerCase()
    if (!/^(text\/(html|plain)|application\/xhtml\+xml)/.test(contentType)) {
      throw badRequest('The URL does not point to an HTML or text document')
    }

    const declaredLength = Number(res.headers.get('content-length') || 0)
    if (declaredLength > env.WEB_FETCH_MAX_BYTES) {
      throw new FetchLimitError('The page is too large to ingest')
    }

    try {
      const body = await readBodyWithCap(res, env.WEB_FETCH_MAX_BYTES)
      return { body, finalUrl: currentUrl.toString(), contentType, bytes: body.length }
    } catch (err) {
      if (err instanceof FetchLimitError) {
        throw badRequest('The page is too large to ingest')
      }
      throw err
    }
  }

  throw externalServiceError('Too many redirects', false)
}
