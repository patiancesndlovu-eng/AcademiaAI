import { describe, it, expect } from 'vitest'
import { chunkText, chunkPages } from '../../src/utils/chunker'

describe('chunkText', () => {
  it('returns no chunks for empty or whitespace-only text', () => {
    expect(chunkText('')).toEqual([])
    expect(chunkText('   \n\n  ')).toEqual([])
  })

  it('returns a single chunk for short text with exact offsets', () => {
    const text = 'Photosynthesis converts sunlight into energy.'
    const chunks = chunkText(text)
    expect(chunks).toHaveLength(1)
    expect(chunks[0].startOffset).toBe(0)
    expect(chunks[0].endOffset).toBe(text.length)
    expect(text.slice(chunks[0].startOffset, chunks[0].endOffset)).toBe(text)
  })

  it('produces contiguous, reconstructable chunks for long text', () => {
    const paragraphs = Array.from({ length: 30 }, (_, i) => `Paragraph ${i} about topic ${i}. `.repeat(20).trim())
    const text = paragraphs.join('\n\n')
    const chunks = chunkText(text)

    expect(chunks.length).toBeGreaterThan(1)
    for (const c of chunks) {
      expect(c.startOffset).toBeLessThan(c.endOffset)
      expect(c.endOffset).toBeLessThanOrEqual(text.length)
      // Chunk content must match the source text at its offsets (citation integrity)
      expect(text.slice(c.startOffset, c.endOffset)).toBe(c.text)
    }
  })

  it('keeps chunks within the target size plus overlap allowance', () => {
    const text = 'word '.repeat(5000)
    const target = 1000
    const overlap = 200
    const chunks = chunkText(text, { targetChars: target, overlapChars: overlap })
    for (const c of chunks) {
      // overlap may push slightly past target, but never 2x
      expect(c.text.length).toBeLessThanOrEqual(target + overlap + 200)
    }
  })

  it('never starts a chunk in the middle of a word', () => {
    const text = 'abcdefghij '.repeat(800)
    const chunks = chunkText(text, { targetChars: 500, overlapChars: 100 })
    for (const c of chunks) {
      expect(c.startOffset === 0 || /\s/.test(text[c.startOffset - 1])).toBe(true)
    }
  })
})

describe('chunkPages', () => {
  it('assigns page numbers, never spans pages, and offsets are document-global', () => {
    const pages = [
      { text: 'Page one content. '.repeat(200), page: 1 },
      { text: 'Page two content. '.repeat(200), page: 2 },
      { text: 'Page three content. '.repeat(200), page: 3 },
    ]
    const chunks = chunkPages(pages, { targetChars: 800, overlapChars: 100 })

    expect(chunks.length).toBeGreaterThan(3)
    const pageStarts = pages.reduce<number[]>((acc, p, i) => {
      acc.push(i === 0 ? 0 : acc[i - 1] + pages[i - 1].text.length)
      return acc
    }, [])
    for (const c of chunks) {
      expect(c.page).toBeGreaterThanOrEqual(1)
      expect(c.page).toBeLessThanOrEqual(3)
      const pageStart = pageStarts[c.page! - 1]
      const pageLen = pages[c.page! - 1].text.length
      expect(c.startOffset).toBeGreaterThanOrEqual(pageStart)
      expect(c.endOffset).toBeLessThanOrEqual(pageStart + pageLen)
      expect(c.text.length).toBeGreaterThan(0)
    }
  })

  it('skips blank pages', () => {
    const chunks = chunkPages([
      { text: '', page: 1 },
      { text: 'real content', page: 2 },
    ])
    expect(chunks).toHaveLength(1)
    expect(chunks[0].page).toBe(2)
  })
})
