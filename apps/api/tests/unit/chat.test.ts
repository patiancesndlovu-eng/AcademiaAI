import { describe, it, expect } from 'vitest'
import { buildContextBlocks, citationsFromText, buildContents } from '../../src/services/chat'
import type { RetrievedChunk } from '../../src/services/retrieval'

const chunk = (i: number, text: string): RetrievedChunk => ({
  chunkId: `chunk_${i}`,
  sourceId: `src_${i}`,
  sourceTitle: `Source ${i}`,
  text,
  startOffset: i * 100,
  endOffset: i * 100 + text.length,
  page: i % 2 === 0 ? 1 : 2,
})

describe('buildContextBlocks', () => {
  it('numbers blocks 1..n and preserves order', () => {
    const { blocks, usedChunks } = buildContextBlocks([chunk(0, 'alpha'), chunk(1, 'beta')])
    expect(blocks).toHaveLength(2)
    expect(blocks[0].startsWith('[1] (Source 0')).toBe(true)
    expect(blocks[1].startsWith('[2] (Source 1')).toBe(true)
    expect(usedChunks.map((c) => c.sourceId)).toEqual(['src_0', 'src_1'])
  })

  it('stops before exceeding the context budget once at least one block exists', () => {
    const big = chunk(0, 'x'.repeat(30_000))
    const { blocks, usedChunks } = buildContextBlocks([big, chunk(1, 'y'.repeat(30_000))])
    expect(blocks).toHaveLength(1)
    expect(usedChunks).toHaveLength(1)
  })

  it('returns empty context for no chunks', () => {
    const { blocks, usedChunks } = buildContextBlocks([])
    expect(blocks).toEqual([])
    expect(usedChunks).toEqual([])
  })
})

describe('buildContents', () => {
  it('marks absent source material explicitly', () => {
    const contents = buildContents('What is X?', '', { blocks: [], usedChunks: [] })
    expect(contents).toContain('SOURCE MATERIAL: none provided.')
    expect(contents).toContain('USER QUESTION:\nWhat is X?')
  })

  it('embeds history, source blocks and the question', () => {
    const context = buildContextBlocks([chunk(0, 'alpha')])
    const contents = buildContents('q', 'User: earlier\n', context)
    expect(contents).toContain('CONVERSATION SO FAR')
    expect(contents).toContain('SOURCE MATERIAL')
    expect(contents).toContain('[1] (Source 0')
    expect(contents).toContain('USER QUESTION:\nq')
  })
})

describe('citationsFromText (spec §95/§96)', () => {
  const chunks = [chunk(0, 'aaa'), chunk(1, 'bbb')]

  it('maps valid markers to chunks with quote and page', () => {
    const citations = citationsFromText('Answer [1] and [2].', chunks)
    expect(citations).toHaveLength(2)
    expect(citations[0].sourceId).toBe('src_0')
    expect(citations[1].sourceId).toBe('src_1')
    expect(citations[0].page).toBe(1)
    expect(citations[1].page).toBe(2)
  })

  it('discards out-of-range markers — no fake sources', () => {
    const citations = citationsFromText('Hallucinated [5] and [99], real [2]', chunks)
    expect(citations).toHaveLength(1)
    expect(citations[0].sourceId).toBe('src_1')
  })

  it('deduplicates repeated markers', () => {
    const citations = citationsFromText('[1] then again [1]', chunks)
    expect(citations).toHaveLength(1)
  })

  it('returns empty when nothing valid is cited', () => {
    expect(citationsFromText('no markers', chunks)).toEqual([])
  })
})
