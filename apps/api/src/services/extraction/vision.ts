import { generateText } from '../../providers/gemini'

/**
 * Gemini Vision OCR fallback for images and scanned PDFs (spec §26/§27).
 * Gemini transcribes the visual content; an empty transcript maps to the
 * meaningful NO_TEXT_DETECTED state rather than a system failure.
 */

const OCR_SYSTEM_INSTRUCTION = [
  'You are a precise OCR transcriber.',
  'Transcribe all legible text from the provided document exactly, preserving reading order.',
  'Keep paragraph breaks. Do not add commentary, headers or explanations.',
  'If the document contains no legible text, respond with only the word: EMPTY',
].join(' ')

export class NoTextDetectedError extends Error {
  constructor() {
    super('No text detected in document')
    this.name = 'NO_TEXT_DETECTED'
  }
}

export async function ocrImage(buffer: Buffer, mimeType: 'image/png' | 'image/jpeg' | 'image/webp'): Promise<string> {
  const transcript = await generateText({
    prompt: 'Transcribe this image.',
    systemInstruction: OCR_SYSTEM_INSTRUCTION,
    inlineData: { mimeType, data: buffer.toString('base64') },
    model: 'vision',
  })

  const text = transcript.trim()
  if (!text || text.toUpperCase() === 'EMPTY') {
    throw new NoTextDetectedError()
  }
  return text
}

export async function ocrPdf(buffer: Buffer): Promise<string> {
  if (buffer.length > 15 * 1024 * 1024) {
    // Gemini inline document limit
    throw new NoTextDetectedError()
  }

  const transcript = await generateText({
    prompt: 'Transcribe this scanned PDF document.',
    systemInstruction: OCR_SYSTEM_INSTRUCTION,
    inlineData: { mimeType: 'application/pdf', data: buffer.toString('base64') },
    model: 'vision',
  })

  const text = transcript.trim()
  if (!text || text.toUpperCase() === 'EMPTY') {
    throw new NoTextDetectedError()
  }
  return text
}
