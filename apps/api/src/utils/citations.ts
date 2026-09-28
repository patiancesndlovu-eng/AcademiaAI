/**
 * Citation integrity (spec §95/§96).
 *
 * The model may only cite numbered context blocks that the backend supplied.
 * Anything else is discarded — no fake sources, pages or quotes are created.
 */

const MARKER_RE = /\[(\d{1,3})\]/g

/** Extract every [n] marker index present in the text (unvalidated). */
export function extractCitationMarkers(text: string): number[] {
  const out: number[] = []
  let m: RegExpExecArray | null
  const re = new RegExp(MARKER_RE.source, 'g')
  while ((m = re.exec(text)) !== null) {
    out.push(parseInt(m[1], 10))
  }
  return out
}

/**
 * Validate citation markers against the retrieved context count.
 * Returns the distinct, in-range citation numbers, in ascending order.
 */
export function validateCitations(text: string, contextCount: number): number[] {
  if (contextCount <= 0) return []
  const valid = new Set<number>()
  for (const n of extractCitationMarkers(text)) {
    if (n >= 1 && n <= contextCount) valid.add(n)
  }
  return [...valid].sort((a, b) => a - b)
}

/**
 * Strip markdown code fences models love to add around JSON output.
 * Plain JSON passes through unchanged.
 */
export function stripCodeFences(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
}

export interface ResolvedSource {
  index: number
  chunkId: string
  sourceId: string
  sourceTitle: string
  page: number | null
  quote: string
}

export interface CitedChunk {
  chunkId: string
  sourceId: string
  sourceTitle: string
  page: number | null
  text: string
}

/**
 * Studio citation provenance without a new table: the model only supplies
 * indexes into the numbered context; metadata (chunk/source/page/quote)
 * always comes from DB chunks. Out-of-range indexes are dropped from every
 * `citations` array in the output — never fabricated.
 */
export function resolveGenerationCitations<T>(output: T, usedChunks: CitedChunk[]): { cleaned: T; sources: ResolvedSource[] } {
  const seen = new Set<number>()
  const visit = (node: any): void => {
    if (Array.isArray(node)) {
      for (const item of node) visit(item)
      return
    }
    if (node && typeof node === 'object') {
      for (const [key, value] of Object.entries(node)) {
        if (key === 'citations' && Array.isArray(value)) {
          node[key] = [...new Set(value.filter((n) => Number.isInteger(n) && n >= 1 && n <= usedChunks.length))].sort((a, b) => a - b)
          for (const n of node[key]) seen.add(n)
        } else {
          visit(value)
        }
      }
    }
  }
  const cleaned = structuredClone(output)
  visit(cleaned)
  const sources: ResolvedSource[] = [...seen].sort((a, b) => a - b).map((n) => {
    const chunk = usedChunks[n - 1]
    return {
      index: n,
      chunkId: chunk.chunkId,
      sourceId: chunk.sourceId,
      sourceTitle: chunk.sourceTitle,
      page: chunk.page,
      quote: chunk.text.slice(0, 280),
    }
  })
  return { cleaned, sources }
}
