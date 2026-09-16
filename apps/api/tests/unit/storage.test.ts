import { describe, it, expect, afterAll } from 'vitest'
import { sanitizeFilename, generatePath, fileExists } from '../../src/services/storage'
import { detectFileKind } from '../../src/utils/magicBytes'
import { unlinkSync, writeFileSync, readFileSync, existsSync } from 'fs'
import { env } from '../../src/config/env'
import { join } from 'path'

describe('sanitizeFilename (spec §140)', () => {
  it('strips path traversal attempts', () => {
    const safe = sanitizeFilename('../../malicious.sh')
    expect(safe).not.toContain('..')
    expect(safe).not.toContain('/')
    expect(safe).not.toContain('\\')
  })

  it('strips unsafe characters', () => {
    const safe = sanitizeFilename('file<>:"|?*.txt')
    expect(safe).toMatch(/^[^<>:"|?*/\\]+$/)
  })

  it('adds a random suffix (collision safety)', () => {
    expect(sanitizeFilename('a.pdf')).not.toBe(sanitizeFilename('a.pdf'))
  })
})

describe('generatePath + fileExists (spec §139)', () => {
  const roundtripPath = generatePath('nb_test_roundtrip', 'hello_abc12345', 'text')

  afterAll(() => {
    try {
      unlinkSync(roundtripPath)
    } catch {
      /* already removed */
    }
  })

  it('builds a path under the upload root with a kind-appropriate extension', () => {
    const p = generatePath('nb_1', 'doc_abc12345', 'pdf')
    expect(p.toLowerCase().startsWith(env.UPLOAD_DIR.toLowerCase())).toBe(true)
    expect(p.endsWith('.pdf')).toBe(true)
    expect(p).toContain('nb_1')
  })

  it('rejects traversal when checking existence', () => {
    expect(fileExists('../../etc/passwd')).toBe(false)
    expect(fileExists('..\\..\\windows\\win.ini')).toBe(false)
    expect(fileExists('C:/Windows/win.ini')).toBe(false)
  })

  it('round-trips a real file', () => {
    writeFileSync(roundtripPath, 'hello world')
    expect(fileExists(roundtripPath)).toBe(true)
    expect(detectFileKind(readFileSync(roundtripPath))).toBe('text')
    unlinkSync(roundtripPath)
    expect(existsSync(roundtripPath)).toBe(false)
  })
})
