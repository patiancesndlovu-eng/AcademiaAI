import { describe, it, expect } from 'vitest'
import { isPrivateAddress, assertSafeUrl } from '../../src/utils/safeFetch'
import { badRequest } from '../../src/utils/errors'

describe('isPrivateAddress', () => {
  it('blocks loopback, private and metadata IPv4 ranges', () => {
    for (const ip of [
      '127.0.0.1',
      '127.9.9.9',
      '10.1.2.3',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '169.254.169.254', // cloud metadata endpoint
      '0.0.0.0',
      '100.64.0.1',
      '224.0.0.1',
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true)
    }
  })

  it('allows public IPv4 addresses', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '100.128.0.1', '169.255.0.1']) {
      expect(isPrivateAddress(ip), ip).toBe(false)
    }
  })

  it('blocks private/loopback IPv6 and IPv4-mapped IPv6', () => {
    for (const ip of ['::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1', 'ff02::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1']) {
      expect(isPrivateAddress(ip), ip).toBe(true)
    }
  })

  it('allows public IPv6', () => {
    expect(isPrivateAddress('2606:4700::1')).toBe(false)
  })
})

describe('assertSafeUrl', () => {
  it('rejects non-http(s) protocols', async () => {
    for (const url of ['file:///etc/passwd', 'ftp://example.com/x', 'gopher://example.com']) {
      await expect(assertSafeUrl(url)).rejects.toThrow()
    }
  })

  it('rejects non-standard ports', async () => {
    await expect(assertSafeUrl('https://example.com:22/x')).rejects.toThrow(badRequest('').constructor)
  })

  it('rejects localhost and internal hostnames before DNS', async () => {
    for (const url of ['http://localhost/x', 'http://foo.localhost/x', 'http://service.internal/x', 'http://printer.local/x']) {
      await expect(assertSafeUrl(url)).rejects.toThrow('internal addresses')
    }
  })

  it('rejects private IP literals', async () => {
    await expect(assertSafeUrl('http://127.0.0.1/x')).rejects.toThrow()
    await expect(assertSafeUrl('http://[::1]/x')).rejects.toThrow()
    await expect(assertSafeUrl('http://169.254.169.254/latest/meta-data')).rejects.toThrow()
  })

  it('rejects unresolvable hosts', async () => {
    await expect(assertSafeUrl('http://this-host-does-not-exist-zzz9x.invalid/x')).rejects.toThrow()
  })

  it('accepts a well-known public URL', async () => {
    const url = await assertSafeUrl('https://example.com/article')
    expect(url.hostname).toBe('example.com')
  })
})
