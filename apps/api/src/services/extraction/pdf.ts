import { PDFParse, PasswordException } from 'pdf-parse'
import { badRequest, processingError } from '../../utils/errors'

/**
 * PDF text extraction (spec §20/§27). Text-layer PDFs are parsed locally via
 * pdf.js (pdf-parse v2). Page boundaries are preserved so citations can point
 * at precise pages. Scanned PDFs yield almost no text — the caller falls back
 * to Gemini Vision transcription.
 */

const MIN_TEXT_FOR_VALID_PDF = 20 // chars across the whole document
const MAX_PAGES = 500

export interface PdfExtraction {
  pages: { text: string; page: number }[]
  fullText: string
  needsOcrFallback: boolean
}

export async function extractPdf(buffer: Buffer): Promise<PdfExtraction> {
  if (buffer.length === 0) {
    throw badRequest('Empty PDF file')
  }
  if (buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
    throw badRequest('Corrupted PDF file')
  }
  if (buffer.length > 50 * 1024 * 1024) {
    throw badRequest('PDF too large to process')
  }

  const parser = new PDFParse({ data: new Uint8Array(buffer) })
  try {
    const result = await parser.getText()

    if (result.total > MAX_PAGES) {
      throw badRequest('PDF exceeds the maximum page count')
    }

    const pages = result.pages.map((p) => ({ text: p.text ?? '', page: p.num }))
    const fullText = pages.map((p) => p.text).join('\n\n')

    return {
      pages,
      fullText,
      needsOcrFallback: fullText.replace(/\s/g, '').length < MIN_TEXT_FOR_VALID_PDF,
    }
  } catch (err) {
    if (err instanceof PasswordException || /password|encrypted/i.test((err as Error).message ?? '')) {
      throw badRequest('Password-protected PDFs are not supported')
    }
    if ((err as { name?: string }).name === 'AppError') throw err
    throw processingError('Could not parse PDF', false)
  } finally {
    await parser.destroy().catch(() => undefined)
  }
}
