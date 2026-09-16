import { describe, it, expect } from 'vitest'
import { normalizeText, countWords } from '../../src/utils/text'

describe('normalizeText', () => {
  it('normalizes CRLF and CR to LF', () => {
    expect(normalizeText('a\r\nb\rc')).toBe('a\nb\nc')
  })

  it('strips control characters but keeps newlines', () => {
    const out = normalizeText('a\u0000b\u0007c\u001Fd\ne\tf')
    expect(out).toBe('abcd\ne f')
  })

  it('collapses runs of spaces/tabs and trims line ends', () => {
    expect(normalizeText('a    b\t\tc   ')).toBe('a b c')
  })

  it('collapses 3+ blank lines to one paragraph break', () => {
    expect(normalizeText('a\n\n\n\n\nb')).toBe('a\n\nb')
  })

  it('applies Unicode NFC normalization', () => {
    // e + combining acute (2 code points) → é (1 code point) under NFC
    const nfc = normalizeText('e\u0301')
    expect(nfc).toBe('é')
  })

  it('trims outer whitespace', () => {
    expect(normalizeText('  hello  ')).toBe('hello')
  })

  it('is idempotent (stable offsets for citations)', () => {
    const once = normalizeText('a  b\r\n\r\nc\u0000   d')
    expect(normalizeText(once)).toBe(once)
  })
})

describe('countWords', () => {
  it('counts whitespace-separated words', () => {
    expect(countWords('one two three')).toBe(3)
  })

  it('returns 0 for empty text', () => {
    expect(countWords('')).toBe(0)
    expect(countWords('   ')).toBe(0)
  })
})
