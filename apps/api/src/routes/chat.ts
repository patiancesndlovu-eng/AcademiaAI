import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { requireApiAuth, syncUserToDb } from '../middleware/auth'
import { requireNotebookRole } from '../middleware/authorization'
import { validateBody, validateParams, validateQuery } from '../middleware/validateRequest'
import { chatLimiter } from '../middleware/rateLimit'
import { success } from '../utils/response'
import { badRequest } from '../utils/errors'
import { logger } from '../utils/logger'
import { env } from '../config/env'
import { streamChat } from '../providers/gemini'
import { searchWeb } from '../providers/search'
import * as chatService from '../services/chat'
import { retrieveChunks } from '../services/retrieval'
import { SYSTEM_INSTRUCTION } from '../services/chat'

const router = Router()

const notebookIdSchema = z.object({ id: z.string().cuid() })

const sendMessageSchema = z.object({
  content: z.string().min(1).max(8000),
  sourceIds: z.array(z.string().cuid()).max(50).optional(),
  webEnhanced: z.boolean().optional(),
})

const listMessagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  cursor: z.string().max(200).optional(),
})

const log = logger.child({ component: 'chat' })

const MIN_CONTEXT_CHUNKS_FOR_SUFFICIENCY = 3

function isContextSufficient(chunks: Awaited<ReturnType<typeof retrieveChunks>>): boolean {
  return chunks.length >= MIN_CONTEXT_CHUNKS_FOR_SUFFICIENCY
}

function buildWebSearchContext(searchResults: Awaited<ReturnType<typeof searchWeb>>): string {
  if (searchResults.length === 0) return ''
  const blocks = searchResults.map((r, i) => `[W${i + 1}] (${r.title} — ${r.domain})\n${r.snippet}`).join('\n\n')
  return `WEB SEARCH RESULTS\n----------------\n${blocks}\n----------------`
}

/**
 * GET /api/v1/notebooks/:id/chat/messages — cursor-paginated history (viewer+).
 */
router.get(
  '/notebooks/:id/chat/messages',
  requireApiAuth,
  syncUserToDb,
  requireNotebookRole('viewer'),
  validateParams(notebookIdSchema),
  validateQuery(listMessagesQuerySchema),
  async (req, res, next) => {
    try {
      const result = await chatService.listMessages(
        req.notebook!.id,
        req.query.limit as unknown as number,
        req.query.cursor as unknown as string | undefined
      )
      res.json(success(result, req.requestId))
    } catch (err) {
      next(err)
    }
  }
)

/**
 * POST /api/v1/notebooks/:id/chat/messages — grounded chat over SSE (spec §37/§38).
 *
 * Flow: authorize → persist user message → retrieve → evaluate context →
 * optional web search → stream deltas with heartbeat → validate citations →
 * persist assistant message + citations.
 * The user's question is never lost on provider failure (spec §39); a client
 * disconnect aborts the provider call and persists partial output.
 */
router.post(
  '/notebooks/:id/chat/messages',
  requireApiAuth,
  syncUserToDb,
  requireNotebookRole('viewer'),
  chatLimiter,
  validateParams(notebookIdSchema),
  validateBody(sendMessageSchema),
  async (req, res, next) => {
    const user = req.user!
    const notebookId = req.notebook!.id
    const { content, sourceIds, webEnhanced = false } = req.body
    const startedAt = Date.now()

    // Everything before the stream starts uses regular JSON errors
    let sourceSelection: { validIds: string[]; invalidIds: string[] }
    let userMessage
    try {
      sourceSelection = await chatService.validateSourceSelection(notebookId, sourceIds ?? [])
      if (sourceIds && sourceIds.length > 0 && sourceSelection.validIds.length === 0) {
        throw badRequest('None of the selected sources are available in this notebook')
      }
      userMessage = await chatService.persistUserMessage(notebookId, user.id, content)
    } catch (err) {
      return next(err)
    }

    // Switch to SSE (spec §37)
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    res.flushHeaders?.()

    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    }

    const heartbeat = setInterval(() => {
      res.write(': ping\n\n') // prevents idle proxy timeouts (spec §38)
    }, 20_000)

    let clientDisconnected = false
    const abortController = new AbortController()
    req.on('close', () => {
      clientDisconnected = true
      abortController.abort()
    })

    try {
      const history = await chatService.getRecentHistory(notebookId, userMessage.id)
      const chunks = await retrieveChunks({
        notebookId,
        query: content,
        sourceIds: sourceSelection.validIds.length > 0 ? sourceSelection.validIds : null,
      })

      let webResults: Awaited<ReturnType<typeof searchWeb>> = []
      let webSearchApplied = false

      // Web-enhanced mode: search only when local context is insufficient (spec §40/§99)
      if (webEnhanced && !isContextSufficient(chunks)) {
        send('message.searching', { query: content })
        try {
          webResults = await searchWeb(content)
          webSearchApplied = webResults.length > 0
        } catch (searchErr) {
          log.warn({ requestId: req.requestId, notebookId, err: (searchErr as Error).message }, 'Web search failed, continuing with local context only')
        }
      }

      const context = chatService.buildContextBlocks(chunks)
      const webContext = webSearchApplied ? buildWebSearchContext(webResults) : ''
      const contents = chatService.buildContents(content, history, context, webContext)

      send('message.started', {
        userMessageId: userMessage.id,
        requestId: req.requestId,
        contextChunks: context.usedChunks.length,
        webSearchApplied,
        rejectedSourceIds: sourceSelection.invalidIds,
      })

      let fullText = ''
      let usage: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } | undefined

      try {
        for await (const delta of streamChat({
          systemInstruction: SYSTEM_INSTRUCTION,
          contents,
          signal: abortController.signal,
        })) {
          if (delta.text) {
            fullText += delta.text
            send('message.delta', { text: delta.text })
          }
          if (delta.usage) usage = delta.usage
        }
      } catch (streamErr) {
        // Partial answer survives a disconnect (spec §38/§39)
        if (clientDisconnected && fullText.trim().length > 0) {
          const localCitations = chatService.citationsFromText(fullText, context.usedChunks)
          const saved = await chatService.persistAssistantMessage(
            notebookId,
            fullText,
            { model: env.GEMINI_CHAT_MODEL, interrupted: true, usage, webEnhanced: { requested: webEnhanced, applied: webSearchApplied } },
            localCitations
          )
          log.info({ requestId: req.requestId, notebookId, messageId: saved.id, partial: true }, 'Chat stream interrupted; partial answer saved')
          clearInterval(heartbeat)
          res.end()
          return
        }
        throw streamErr
      }

      // Citation validation happens server-side from retrieval metadata (spec §95/§96)
      const citations = chatService.citationsFromText(fullText, context.usedChunks)
      for (const c of citations) {
        const chunk = context.usedChunks.find((u) => u.sourceId === c.sourceId)
        send('citation', {
          sourceId: c.sourceId,
          sourceTitle: chunk?.sourceTitle,
          quote: c.quote,
          page: c.page,
        })
      }
      // Web citations (spec §97) — sent as separate events with domain/url
      if (webSearchApplied) {
        for (let i = 0; i < webResults.length; i++) {
          const r = webResults[i]
          send('citation', {
            sourceId: `web_${i}`,
            sourceTitle: r.title,
            quote: r.snippet,
            page: null,
            url: r.url,
            domain: r.domain,
          })
        }
      }

      const saved = await chatService.persistAssistantMessage(notebookId, fullText, {
        model: env.GEMINI_CHAT_MODEL,
        usage,
        webEnhanced: { requested: webEnhanced, applied: webSearchApplied },
      }, citations)

      send('message.completed', {
        messageId: saved.id,
        model: env.GEMINI_CHAT_MODEL,
        usage,
        webSearchApplied,
        durationMs: Date.now() - startedAt,
      })
      log.info(
        {
          requestId: req.requestId,
          notebookId,
          userId: user.id,
          messageId: saved.id,
          durationMs: Date.now() - startedAt,
          citationCount: citations.length,
          contextChunks: context.usedChunks.length,
          webSearchApplied,
        },
        'chat_completed'
      )
    } catch (err) {
      const appErr = err as { statusCode?: number; code?: string; message?: string; retryable?: boolean }
      log.error(
        { requestId: req.requestId, notebookId, err: (err as Error).message, code: appErr.code },
        'Chat generation failed'
      )
      if (!clientDisconnected) {
        send('message.error', {
          code: appErr.code ?? 'AI_GENERATION_FAILED',
          message: 'The assistant could not generate a response. Your message was saved.',
          retryable: appErr.retryable ?? true,
        })
      }
    } finally {
      clearInterval(heartbeat)
      if (!clientDisconnected) res.end()
    }
  }
)

export default router