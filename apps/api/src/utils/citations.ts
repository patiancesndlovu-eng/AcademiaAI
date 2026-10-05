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
