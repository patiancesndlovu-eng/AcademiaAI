import { Prisma } from '@prisma/client'
import { prisma } from '../config/db'
import { env } from '../config/env'
import { getOrSet } from '../cache/cache'
import { cacheTtls } from '../cache/keys'
import { retrievalKey } from '../cache/invalidation'

/**
 * Retrieval over source chunks (spec §30/§31). MVP is lexical: Postgres
 * full-text search (websearch_to_tsquery + ts_rank_cd), with an ILIKE
 * fallback for queries FTS can't tokenize. Only chunks from selected, ready,
 * non-deleted sources of the notebook are ever retrievable.
 */

export interface RetrievedChunk {
  chunkId: string
  sourceId: string
  sourceTitle: string
  text: string
  startOffset: number | null
  endOffset: number | null
  page: number | null
}

interface RawRow {
  chunk_id: string
  source_id: string
  source_title: string
  text: string
  start_offset: number | null
  end_offset: number | null
  page_offset: number | null
}

function mapRows(rows: RawRow[]): RetrievedChunk[] {
  return rows.map((r) => ({
    chunkId: r.chunk_id,
    sourceId: r.source_id,
    sourceTitle: r.source_title,
    text: r.text,
    startOffset: r.start_offset,
    endOffset: r.end_offset,
    page: r.page_offset,
  }))
}

const baseFilter = (notebookId: string, sourceIds: string[] | null): { from: Prisma.Sql; where: Prisma.Sql } => {
  const scope = sourceIds
    ? Prisma.sql`AND s.id IN (${Prisma.join(sourceIds)})`
    : Prisma.sql`AND s.selected = true`
  return {
    from: Prisma.sql`
      FROM "SourceChunk" c
      JOIN "Source" s ON s.id = c."sourceId"
    `,
    where: Prisma.sql`
      s."notebookId" = ${notebookId}
      AND s.status = 'ready'
      AND s."deletedAt" IS NULL
      AND s."notebookId" IN (SELECT id FROM "Notebook" WHERE "deletedAt" IS NULL)
      ${scope}
    `,
  }
}

async function ftsSearch(notebookId: string, query: string, sourceIds: string[] | null, limit: number): Promise<RetrievedChunk[]> {
  const { from, where } = baseFilter(notebookId, sourceIds)
  const rows = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
    SELECT c.id AS chunk_id, c."sourceId" AS source_id, s.title AS source_title, c.text,
           c."startOffset" AS start_offset, c."endOffset" AS end_offset, c."pageOffset" AS page_offset,
           ts_rank_cd(to_tsvector('english', c.text), q.query) AS rank
    ${from}
    CROSS JOIN websearch_to_tsquery('english', ${query}) AS q(query)
    WHERE ${where}
      AND to_tsvector('english', c.text) @@ q.query
    ORDER BY rank DESC, c.id ASC
    LIMIT ${limit}
  `)
  return mapRows(rows)
}

function escapeLike(query: string): string {
  return query.replace(/[\\%_]/g, (c) => `\\${c}`)
}

async function likeSearch(notebookId: string, query: string, sourceIds: string[] | null, limit: number): Promise<RetrievedChunk[]> {
  const { from, where } = baseFilter(notebookId, sourceIds)
  const pattern = `%${escapeLike(query)}%`
  const rows = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
    SELECT c.id AS chunk_id, c."sourceId" AS source_id, s.title AS source_title, c.text,
           c."startOffset" AS start_offset, c."endOffset" AS end_offset, c."pageOffset" AS page_offset
    ${from}
    WHERE ${where}
      AND c.text ILIKE ${pattern} ESCAPE '\\'
    ORDER BY c.id ASC
    LIMIT ${limit}
  `)
  return mapRows(rows)
}

export interface RetrieveOptions {
  notebookId: string
  query: string
  /** Explicit source selection (validated upstream); null = all selected sources. */
  sourceIds?: string[] | null
}

/**
 * Bounded retrieval with a short-TTL cache. FTS runs first; if it surfaces
 * fewer than 3 chunks the ILIKE fallback tops it up. Results are capped at
 * RETRIEVAL_TOP_K chunks regardless (spec §31).
 */
export async function retrieveChunks({ notebookId, query, sourceIds = null }: RetrieveOptions): Promise<RetrievedChunk[]> {
  const trimmed = query.trim().slice(0, 400)
  if (!trimmed) return []

  const selectionSeed = sourceIds ? sourceIds.slice().sort().join(',') : 'selected'
  const key = await retrievalKey(notebookId, trimmed, selectionSeed)

  return getOrSet(key, cacheTtls.retrievalSec, async () => {
    const limit = env.RETRIEVAL_TOP_K

    let results = await ftsSearch(notebookId, trimmed, sourceIds, limit)
    if (results.length < 3) {
      const excludeIds = results.map((r) => r.chunkId)
      const fallback = await likeSearch(notebookId, trimmed, sourceIds, limit)
      const fresh = fallback.filter((r) => !excludeIds.includes(r.chunkId))
      results = [...results, ...fresh].slice(0, limit)
    }

    // Deterministic order (spec §124)
    return results.slice(0, limit)
  })
}
