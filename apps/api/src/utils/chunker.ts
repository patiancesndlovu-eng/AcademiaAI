/**
 * Chunking for retrieval + citation anchoring (spec §29).
 *
 * Chunks target ~2400 chars (~600 tokens) with ~300 chars of overlap, split
 * on paragraph, then sentence, boundaries. Every chunk records exact
 * startOffset/endOffset into the (normalized) document text, plus an optional
 * 1-based page number when the extractor provides page boundaries.
 */

export interface Chunk {
  text: string
  startOffset: number
  endOffset: number
  page?: number
}

export interface ChunkOptions {
  targetChars?: number
  overlapChars?: number
}

const DEFAULT_TARGET = 2400
const DEFAULT_OVERLAP = 300

/** Split a text block into sentence-ish pieces no longer than maxChars. */
function splitToPieces(text: string, maxChars: number): { text: string; start: number; end: number }[] {
  const pieces: { text: string; start: number; end: number }[] = []

  const paragraphs = matchAll(text, /\n{2,}/g) // paragraph boundaries
  let cursor = 0

  const pushSlice = (start: number, end: number) => {
    const slice = text.slice(start, end)
    if (slice.trim().length === 0) return
    if (slice.length <= maxChars) {
      pieces.push({ text: slice, start, end })
      return
    }
    // Sentence split within an oversized block
    const sentenceRe = /[^.!?。！？\n]+[.!?。！？]*\s*/g
    let sentence: RegExpExecArray | null
    let bufStart = start
    let bufEnd = start
    while ((sentence = sentenceRe.exec(slice)) !== null) {
      const sStart = start + sentence.index
      const sEnd = sStart + sentence[0].length
      if (bufEnd > bufStart && sEnd - bufStart > maxChars) {
        pieces.push({ text: text.slice(bufStart, bufEnd), start: bufStart, end: bufEnd })
        bufStart = bufEnd
      }
      bufEnd = sEnd
    }
    if (bufEnd > bufStart) {
      if (bufEnd - bufStart > maxChars) {
        // Hard-split pathological sentences (e.g. no punctuation)
        for (let i = bufStart; i < bufEnd; i += maxChars) {
          pieces.push({ text: text.slice(i, Math.min(i + maxChars, bufEnd)), start: i, end: Math.min(i + maxChars, bufEnd) })
        }
      } else {
        pieces.push({ text: text.slice(bufStart, bufEnd), start: bufStart, end: bufEnd })
      }
    }
  }

  for (const m of paragraphs) {
    if (m.index > cursor) {
      pushSlice(cursor, m.index)
    }
    cursor = m.index + m[0].length
  }
  if (cursor < text.length) pushSlice(cursor, text.length)

  return pieces
}

function matchAll(text: string, re: RegExp): RegExpExecArray[] {
  const out: RegExpExecArray[] = []
  let m: RegExpExecArray | null
  const copy = new RegExp(re.source, re.flags)
  while ((m = copy.exec(text)) !== null) {
    out.push(m)
    if (m[0].length === 0) break
  }
  return out
}

function snapBackwardToWordStart(text: string, offset: number): number {
  // Move offset back to the start of the current word so an overlap chunk
  // begins at a word boundary (duplicates the tail, never skips content)
  while (offset > 0 && !/\s/.test(text[offset - 1])) offset--
  return offset
}

export function chunkText(text: string, options: ChunkOptions = {}): Chunk[] {
  const target = Math.max(200, options.targetChars ?? DEFAULT_TARGET)
  const overlap = Math.min(Math.max(0, options.overlapChars ?? DEFAULT_OVERLAP), Math.floor(target / 2))

  if (text.trim().length === 0) return []

  const pieces = splitToPieces(text, target)
  const chunks: Chunk[] = []

  let curStart = 0
  let curEnd = 0 // exclusive offset into `text`
  let curLen = 0
  let open = false

  const flush = () => {
    if (!open || curLen === 0) return
    chunks.push({ text: text.slice(curStart, curEnd), startOffset: curStart, endOffset: curEnd })
    open = false
  }

  for (const piece of pieces) {
    if (!open) {
      curStart = piece.start
      curEnd = piece.end
      curLen = piece.end - piece.start
      open = true
      continue
    }

    if (curLen + (piece.end - piece.start) <= target) {
      curEnd = piece.end
      curLen = curEnd - curStart
      continue
    }

    flush()

    // Start next chunk with a trailing overlap from the previous one,
    // aligned to a word boundary (content is duplicated, never skipped)
    if (overlap > 0 && curEnd > curStart) {
      const overlapStart = Math.max(curEnd - overlap, curStart)
      const snapped = snapBackwardToWordStart(text, overlapStart)
      if (snapped < piece.end) {
        curStart = Math.min(snapped, piece.start)
        curEnd = piece.end
        curLen = curEnd - curStart
        open = true
        continue
      }
    }

    curStart = piece.start
    curEnd = piece.end
    curLen = piece.end - piece.start
    open = true
  }
  flush()

  return chunks
}

/**
 * Chunk page-delimited documents (PDFs). Each page is chunked independently
 * so a chunk never spans two pages — citations can point at a precise page.
 * Offsets are relative to the concatenated document text.
 */
export function chunkPages(pages: { text: string; page: number }[], options: ChunkOptions = {}): Chunk[] {
  const chunks: Chunk[] = []
  let globalOffset = 0

  for (const { text: pageText, page } of pages) {
    const normalizedPage = pageText
    if (normalizedPage.trim().length === 0) {
      globalOffset += normalizedPage.length
      continue
    }
    for (const c of chunkText(normalizedPage, options)) {
      chunks.push({
        text: c.text,
        startOffset: globalOffset + c.startOffset,
        endOffset: globalOffset + c.endOffset,
        page,
      })
    }
    globalOffset += normalizedPage.length
  }

  return chunks
}
