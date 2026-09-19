/**
 * Text normalization applied before chunking (spec §28).
 *
 * Rules:
 *  - Unicode NFC normalization
 *  - CRLF / CR → LF
 *  - strip control characters (keep \n and \t)
 *  - collapse runs of spaces/tabs to a single space, trim line ends
 *  - collapse 3+ consecutive newlines to a paragraph break (\n\n)
 *
 * Offsets used for citations are computed AFTER normalization, so normalizing
 * a stored chunk's text is idempotent and offsets stay stable.
 */
export function normalizeText(raw: string): string {
  let text = raw.normalize('NFC')

  text = text.replace(/\r\n?/g, '\n')
  // eslint-disable-next-line no-control-regex
  text = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')

  const lines = text.split('\n').map((line) => line.replace(/[ \t]+/g, ' ').trimEnd())
  text = lines.join('\n')
  text = text.replace(/\n{3,}/g, '\n\n')
  return text.trim()
}

export function countWords(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).length
}
