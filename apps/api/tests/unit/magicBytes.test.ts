import { describe, it, expect } from 'vitest'
import { detectFileKind, kindFromMimeType } from '../../src/utils/magicBytes'

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
const JPEG_SIG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])
const WEBP_SIG = Buffer.concat([Buffer.from('RIFF', 'latin1'), Buffer.alloc(4), Buffer.from('WEBP', 'latin1'), Buffer.alloc(4)])
const PDF_SIG = Buffer.from('%PDF-1.7\n...', 'latin1')

describe('detectFileKind', () => {
  it('detects PNG by signature', () => {
    expect(detectFileKind(PNG_SIG)).toBe('png')
  })

  it('detects JPEG by signature', () => {
    expect(detectFileKind(JPEG_SIG)).toBe('jpeg')
  })

  it('detects WEBP by RIFF/WEBP signature', () => {
    expect(detectFileKind(WEBP_SIG)).toBe('webp')
  })

  it('detects PDF by %PDF- header', () => {
    expect(detectFileKind(PDF_SIG)).toBe('pdf')
  })

  it('detects UTF-8 text', () => {
    expect(detectFileKind(Buffer.from('plain text notes'))).toBe('text')
  })

  it('rejects executables and unknown binaries', () => {
    const exe = Buffer.concat([Buffer.from('MZ', 'latin1'), Buffer.alloc(20, 1)])
    expect(detectFileKind(exe)).toBeNull()
    expect(detectFileKind(Buffer.alloc(64, 0x00))).toBeNull()
  })

  it('rejects content spoofing a declared type (client lies about MIME)', () => {
    // An executable whose filename says .pdf must fail signature inspection
    const exe = Buffer.concat([Buffer.from('MZ', 'latin1'), Buffer.alloc(30, 1)])
    expect(detectFileKind(exe)).not.toBe('pdf')
  })
})

describe('kindFromMimeType', () => {
  it('maps declared MIME types to kinds', () => {
    expect(kindFromMimeType('application/pdf')).toBe('pdf')
    expect(kindFromMimeType('image/png')).toBe('png')
    expect(kindFromMimeType('image/jpeg')).toBe('jpeg')
    expect(kindFromMimeType('image/jpg')).toBe('jpeg')
    expect(kindFromMimeType('image/webp')).toBe('webp')
    expect(kindFromMimeType('text/plain')).toBe('text')
  })

  it('rejects unsupported or dangerous types', () => {
    expect(kindFromMimeType('application/x-msdownload')).toBeNull()
    expect(kindFromMimeType('application/zip')).toBeNull()
    expect(kindFromMimeType('application/msword')).toBeNull()
    expect(kindFromMimeType('')).toBeNull()
  })

  it('handles MIME parameters', () => {
    expect(kindFromMimeType('text/plain; charset=utf-8')).toBe('text')
  })
})
