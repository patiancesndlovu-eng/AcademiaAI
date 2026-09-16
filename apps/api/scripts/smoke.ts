/**
 * End-to-end pipeline smoke test. Run with the API + worker processes up:
 *   npx tsx scripts/smoke.ts
 *
 * Exercises: enqueue → BullMQ → worker → URL/PDF extraction → chunking →
 * ready state → FTS retrieval → grounded Gemini stream. Creates and deletes
 * its own SMOKE_TEST notebook.
 */
import 'dotenv/config'
import { prisma } from '../src/config/db'
import { ingestionQueue } from '../src/queues/queues'
import { retrieveChunks } from '../src/services/retrieval'
import { buildContextBlocks, buildContents, SYSTEM_INSTRUCTION } from '../src/services/chat'
import { streamChat } from '../src/providers/gemini'
import { env } from '../src/config/env'
import { logger } from '../src/utils/logger'

const log = logger.child({ component: 'smoke' })
const NOTEBOOK_TITLE = 'SMOKE_TEST_e2e'
const TIMEOUT_MS = 90_000

function buildMinimalPdf(lines: string[]): Buffer {
  const esc = (s: string) => s.replace(/([()\\])/g, '\\$1')
  const textOps = lines.map((line, i) => `BT /F1 12 Tf 72 ${720 - i * 20} Td (${esc(line)}) Tj ET`).join('\n')
  const content = textOps
  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]

  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((body, i) => {
    offsets.push(pdf.length)
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`
  })
  const xrefStart = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const off of offsets) pdf += `${String(off).padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`
  return Buffer.from(pdf, 'latin1')
}

async function waitForSource(sourceId: string, label: string): Promise<void> {
  const deadline = Date.now() + TIMEOUT_MS
  while (Date.now() < deadline) {
    const source = await prisma.source.findUnique({ where: { id: sourceId } })
    if (!source) throw new Error(`${label}: source vanished`)
    if (source.status === 'ready' || source.status === 'failed') {
      const chunks = await prisma.sourceChunk.count({ where: { sourceId } })
      log.info(
        {
          label,
          status: source.status,
          progress: source.progress,
          wordCount: source.wordCount,
          chunks,
          error: source.processingError,
        },
        `${label} → ${source.status}`
      )
      if (source.status === 'failed') throw new Error(`${label} failed: ${source.processingError}`)
      return
    }
    await new Promise((r) => setTimeout(r, 1500))
  }
  throw new Error(`${label}: timed out waiting for ingestion`)
}

async function main(): Promise<void> {
  // Clean slate
  await prisma.notebook.deleteMany({ where: { title: { startsWith: NOTEBOOK_TITLE } } })
  const smokeUser = await prisma.user.upsert({
    where: { clerkId: 'smoke_test_clerk_id' },
    update: {},
    create: { clerkId: 'smoke_test_clerk_id', email: 'smoke@local.test', displayName: 'Smoke' },
  })
  const notebook = await prisma.notebook.create({
    data: { title: NOTEBOOK_TITLE, ownerId: smokeUser.id, members: { create: { userId: smokeUser.id, role: 'owner' } } },
  })

  // 1. URL ingestion through the worker
  const urlSource = await prisma.source.create({
    data: {
      notebookId: notebook.id,
      type: 'url',
      title: 'example.com',
      canonicalUrl: 'https://example.com/',
      domain: 'example.com',
      status: 'queued',
    },
  })
  await ingestionQueue.add('ingest', { sourceId: urlSource.id, requestId: 'smoke_url' }, { jobId: `${urlSource.id}-a1` })

  // 2. PDF ingestion through the worker
  const pdf = buildMinimalPdf([
    'AcademiaAI smoke test: the mitochondria is the powerhouse of the cell.',
    'Photosynthesis converts light into chemical energy in green plants.',
  ])
  const pdfSource = await prisma.source.create({
    data: {
      notebookId: notebook.id,
      type: 'upload',
      title: 'smoke.pdf',
      filePath: '',
      status: 'queued',
    },
  })
  const { saveFile } = await import('../src/services/storage')
  const filePath = `${env.UPLOAD_DIR}\\${notebook.id}\\smoke_${Date.now()}.pdf`
  await saveFile(filePath, pdf)
  await prisma.source.update({ where: { id: pdfSource.id }, data: { filePath } })
  await ingestionQueue.add('ingest', { sourceId: pdfSource.id, requestId: 'smoke_pdf' }, { jobId: `${pdfSource.id}-a1` })

  // 3. Wait for the worker to process both
  await waitForSource(urlSource.id, 'URL')
  await waitForSource(pdfSource.id, 'PDF')

  // 4. FTS retrieval over the ingested content
  const chunks = await retrieveChunks({ notebookId: notebook.id, query: 'photosynthesis energy' })
  log.info({ retrieved: chunks.length, first: chunks[0]?.sourceTitle, page: chunks[0]?.page }, 'FTS retrieval')

  if (chunks.length === 0) {
    const raw = await prisma.$queryRawUnsafe(
      `SELECT c.id, s.title, ts_rank_cd(to_tsvector('english', c.text), websearch_to_tsquery('english', 'photosynthesis energy')) AS rank
       FROM "SourceChunk" c JOIN "Source" s ON s.id = c."sourceId"
       WHERE s."notebookId" = '${notebook.id}' AND to_tsvector('english', c.text) @@ websearch_to_tsquery('english', 'photosynthesis energy')`
    )
    log.warn({ notebookId: notebook.id, raw }, 'Raw FTS SQL result')
    const cacheProbe = await prisma.$queryRawUnsafe(
      `SELECT count(*)::int AS n FROM "SourceChunk" c JOIN "Source" s ON s.id = c."sourceId" WHERE s."notebookId" = '${notebook.id}'`
    )
    log.warn({ cacheProbe }, 'chunk count via SQL')
  }

  // 5. Grounded Gemini stream (real API call)
  const context = buildContextBlocks(chunks)
  const contents = buildContents('What does the smoke test say about photosynthesis?', '', context)
  let answer = ''
  for await (const delta of streamChat({ systemInstruction: SYSTEM_INSTRUCTION, contents })) {
    answer += delta.text
  }
  log.info({ chars: answer.length, preview: answer.slice(0, 180) }, 'Gemini grounded answer')

  const ok = chunks.length > 0 && answer.length > 0
  log.info(ok ? 'SMOKE PASS ✅' : 'SMOKE FAIL ❌')

  if (ok) {
    // Cleanup only on success — failed runs keep data for inspection
    await prisma.notebook.delete({ where: { id: notebook.id } })
    await prisma.user.delete({ where: { id: smokeUser.id } }).catch(() => undefined)
  }
  process.exit(ok ? 0 : 1)
}

main()
  .catch(async (err) => {
    log.error({ err: (err as Error).stack ?? err }, 'SMOKE FAILED ❌')
    // keep data for inspection; clean manually if needed:
    // DELETE FROM "Notebook" WHERE title LIKE 'SMOKE_TEST%'
    process.exit(1)
  })
