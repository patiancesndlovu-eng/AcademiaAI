import { readFileSync } from 'fs'
import axios from 'axios'
import * as cheerio from 'cheerio'
import { Readability } from '@mozilla/readability'
import { JSDOM } from 'jsdom'

// For image OCR, use Tesseract.js on the server or call an external service.
// This stub uses a placeholder — wire in tesseract.js or Google Vision as needed.
export async function extractImageText(filePath: string): Promise<string> {
  // TODO: Integrate tesseract.js or Google Vision API
  // Example with tesseract.js:
  // const { createWorker } = require('tesseract.js')
  // const worker = await createWorker('eng')
  // const ret = await worker.recognize(filePath)
  // await worker.terminate()
  // return ret.data.text
  return '[Image OCR not yet implemented]'
}

export async function extractPdfText(filePath: string): Promise<string> {
  // TODO: Integrate pdf-parse or similar
  // const pdfParse = require('pdf-parse')
  // const dataBuffer = readFileSync(filePath)
  // const data = await pdfParse(dataBuffer)
  // return data.text
  return '[PDF extraction not yet implemented]'
}

export async function extractPlainText(filePath: string): Promise<string> {
  return readFileSync(filePath, 'utf-8')
}

export async function extractWebPage(url: string): Promise<{
  text: string
  title?: string
  domain?: string
  author?: string
}> {
  const { data: html } = await axios.get(url, {
    timeout: 10000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; AcademiaAI/1.0)',
    },
    maxContentLength: 5 * 1024 * 1024, // 5MB
  })

  const dom = new JSDOM(html, { url })
  const reader = new Readability(dom.window.document)
  const article = reader.parse()

  const $ = cheerio.load(html)
  const title = article?.title || $('title').text() || undefined
  const text = article?.textContent || $('body').text() || ''
  const domain = new URL(url).hostname
  const author =
    article?.byline ||
    $('meta[name="author"]').attr('content') ||
    $('meta[property="article:author"]').attr('content') ||
    undefined

  return { text, title, domain, author }
}