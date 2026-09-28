import { describe, it, expect } from 'vitest'
import { extractCitationMarkers, validateCitations, resolveGenerationCitations, stripCodeFences } from '../../src/utils/citations'

describe('extractCitationMarkers', () => {
  it('finds all [n] markers in order', () => {
    expect(extractCitationMarkers('Claim one [1] and claim two [2][3].')).toEqual([1, 2, 3])
  })

  it('returns duplicates when repeated', () => {
    expect(extractCitationMarkers('[2] then [2]')).toEqual([2, 2])
  })

  it('ignores bracketed text that is not a marker', () => {
    expect(extractCitationMarkers('[note] [12x] [] [4]')).toEqual([4])
  })

  it('caps marker width at 3 digits', () => {
    expect(extractCitationMarkers('[1234]')).toEqual([])
  })
})

describe('validateCitations', () => {
  it('keeps only in-range markers, deduplicated and sorted (spec §96)', () => {
    expect(validateCitations('[3][1][99][1][0][2]', 3)).toEqual([1, 2, 3])
  })

  it('discards everything when no context was retrieved', () => {
    expect(validateCitations('[1][2]', 0)).toEqual([])
  })

  it('returns empty for text without markers', () => {
    expect(validateCitations('no citations here', 5)).toEqual([])
  })
})

describe('resolveGenerationCitations', () => {
  const chunks = [
    { chunkId: 'chunk_1', sourceId: 'src_a', sourceTitle: 'DBMS Unit II', page: 4, text: 'Normalization is the process of organizing data.' },
    { chunkId: 'chunk_2', sourceId: 'src_b', sourceTitle: 'Design Notes', page: 7, text: 'A relation is normalized to reduce redundancy.' },
  ]

  it('resolves indexes to real chunk/source metadata', () => {
    const output = { questions: [{ question: 'Q?', citations: [1, 2] }] }
    const { cleaned, sources } = resolveGenerationCitations(output, chunks)
    expect(cleaned.questions[0].citations).toEqual([1, 2])
    expect(sources).toEqual([
      { index: 1, chunkId: 'chunk_1', sourceId: 'src_a', sourceTitle: 'DBMS Unit II', page: 4, quote: chunks[0].text },
      { index: 2, chunkId: 'chunk_2', sourceId: 'src_b', sourceTitle: 'Design Notes', page: 7, quote: chunks[1].text },
    ])
  })

  it('drops out-of-range indexes instead of fabricating citations', () => {
    const output = { questions: [{ question: 'Q?', citations: [1, 99, -1, 0] }], citations: [99] }
    const { cleaned, sources } = resolveGenerationCitations(output, chunks)
    expect(cleaned.questions[0].citations).toEqual([1])
    expect(cleaned.citations).toEqual([])
    expect(sources).toHaveLength(1)
  })

  it('does not mutate the original output', () => {
    const output = { questions: [{ question: 'Q?', citations: [99] }] }
    resolveGenerationCitations(output, chunks)
    expect(output.questions[0].citations).toEqual([99])
  })
})

describe('stripCodeFences', () => {
  it('strips ```json fences models add around JSON output', () => {
    expect(stripCodeFences('```json\n{"a":1}\n```')).toBe('{"a":1}')
  })

  it('leaves plain JSON unchanged', () => {
    expect(stripCodeFences('{"a":1}')).toBe('{"a":1}')
  })
})
