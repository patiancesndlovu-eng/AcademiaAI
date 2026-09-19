/**
 * File signature (magic byte) detection. Client-supplied filename, extension
 * and MIME type are never trusted (spec §22) — the actual bytes decide.
 */
export type DetectedKind = 'pdf' | 'png' | 'jpeg' | 'webp' | 'text' | null

export function detectFileKind(buffer: Buffer): DetectedKind {
  if (buffer.length < 12) {
    // Too small for any binary signature; fall through to text check
    return looksLikeText(buffer) ? 'text' : null
  }

  // %PDF-
  if (buffer.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf'

  // PNG signature
  const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (PNG.every((b, i) => buffer[i] === b)) return 'png'

  // JPEG starts with FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg'

  // WEBP: "RIFF" + 4 bytes size + "WEBP"
  if (
    buffer.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buffer.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'webp'
  }

  return looksLikeText(buffer) ? 'text' : null
}

function looksLikeText(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, 1024)
  // Reject binary signatures: NUL bytes and C0 control codes (except \t \n \r \f)
  for (const byte of sample) {
    const isControl = byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d && byte !== 0x0c
    if (byte === 0 || isControl) return false
  }
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(sample)
    return true
  } catch {
    return false
  }
}

/**
 * Declared MIME type (from the client) mapped to the internal kind it must
 * match after signature inspection. Unknown/unsupported MIME → null.
 */
export function kindFromMimeType(mime: string): DetectedKind {
  const normalized = mime.toLowerCase().split(';')[0].trim()
  switch (normalized) {
    case 'application/pdf':
      return 'pdf'
    case 'image/png':
      return 'png'
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpeg'
    case 'image/webp':
      return 'webp'
    case 'text/plain':
      return 'text'
    default:
      return null
  }
}

/** Human-facing extension for a detected kind (storage + client messaging). */
export function extensionForKind(kind: Exclude<DetectedKind, null>): string {
  switch (kind) {
    case 'pdf':
      return 'pdf'
    case 'png':
      return 'png'
    case 'jpeg':
      return 'jpg'
    case 'webp':
      return 'webp'
    case 'text':
      return 'txt'
  }
}
