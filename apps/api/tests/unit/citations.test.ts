import { describe, it, expect } from 'vitest'
import { extractCitationMarkers, validateCitations } from '../../src/utils/citations'

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
