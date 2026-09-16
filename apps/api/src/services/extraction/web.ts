import * as cheerio from 'cheerio'
import { Readability } from '@mozilla/readability'
import { JSDOM } from 'jsdom'
import { safeFetchText } from '../../utils/safeFetch'

/**
 * Web page extraction for URL ingestion (spec §42/§93). Fetching goes
 * through the SSRF-safe fetcher; HTML is reduced to readable text before it
 * ever touches storage, prompts or the database.
 */

export interface WebExtraction {
  text: string
  title?: string
  domain: string
  author?: string
  finalUrl: string
}

const MAX_TEXT_CHARS = 500_000

export async function extractWebPage(url: string): Promise<WebExtraction> {
  const { body: html, finalUrl } = await safeFetchText(url)

  const dom = new JSDOM(html, { url: finalUrl })
  const reader = new Readability(dom.window.document)
  const article = reader.parse()

  const $ = cheerio.load(html)
  const title = article?.title || $('title').first().text() || undefined
  const author =
    article?.byline ||
    $('meta[name="author"]').attr('content') ||
    $('meta[property="article:author"]').attr('content') ||
    undefined

  let text = article?.textContent ?? ''
  if (!text.trim()) {
    text = dom.window.document.body?.textContent ?? ''
  }

  // Whitespace collapse via the shared normalizer happens in the worker;
  // here we only bound the size.
  text = text.slice(0, MAX_TEXT_CHARS)

  return {
    text,
    title: title?.slice(0, 200),
    domain: new URL(finalUrl).hostname,
    author: author?.slice(0, 200),
    finalUrl,
  }
}
