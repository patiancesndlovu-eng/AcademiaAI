import { Router } from 'express'
import { z } from 'zod'
import { requireApiAuth, syncUserToDb } from '../middleware/auth'
import { requireNotebookRole } from '../middleware/authorization'
import { validateBody, validateParams, validateQuery } from '../middleware/validateRequest'
import { uploadLimiter, urlIngestionLimiter, retryLimiter, searchLimiter } from '../middleware/rateLimit'
import { success } from '../utils/response'
import { AppError, notFound } from '../utils/errors'
import { isSearchConfigured, searchWeb } from '../providers/search'
import * as sourceService from '../services/sources'

const router = Router()

const notebookIdSchema = z.object({ id: z.string().cuid() })
const sourceIdSchema = z.object({ sourceId: z.string().cuid() })

const listSourcesQuerySchema = z.object({
  status: z.enum(['queued', 'processing', 'ready', 'failed']).optional(),
  search: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
})

const addUrlSchema = z.object({
  url: z.string().url().max(2048),
  title: z.string().min(1).max(200).optional(),
})

const addTextSchema = z.object({
  title: z.string().min(1).max(200),
  text: z.string().min(1).max(50000),
})

const uploadIntentSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(100),
  size: z.number().int().min(1).max(10485760),
})

const uploadCompleteSchema = z.object({
  filePath: z.string().min(1).max(500),
})

const batchSelectSchema = z.object({
  sourceIds: z.array(z.string().cuid()).min(1).max(100),
  selected: z.boolean(),
})

const updateSourceSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    selected: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field is required' })

const webSearchQuerySchema = z.object({
  q: z.string().trim().min(2).max(200),
  limit: z.coerce.number().int().min(1).max(10).optional().default(8),
})

// GET /api/v1/notebooks/:id/sources/search — discover URLs to import (viewer+).
// Importing stays editor+ via POST .../sources/url. Never exposes raw
// provider payloads or keys; disabled/timeout/provider-failure are distinct
// error codes so the UI never shows "no results" for a broken search.
router.get(
  '/notebooks/:id/sources/search',
  requireApiAuth,
  syncUserToDb,
  requireNotebookRole('viewer'),
  searchLimiter,
  validateParams(notebookIdSchema),
  validateQuery(webSearchQuerySchema),
  async (req, res, next) => {
    try {
      if (!isSearchConfigured()) {
        return next(new AppError('SEARCH_DISABLED', 'Web search is currently unavailable', 503, false))
      }
      const { q, limit } = req.query as unknown as { q: string; limit: number }
      const results = await searchWeb(q)
      res.json(success({ results: results.slice(0, limit), query: q.trim() }, req.requestId))
    } catch (err) {
      next(err)
    }
  }
)

// GET /api/v1/notebooks/:id/sources — viewer+
router.get(
  '/notebooks/:id/sources',
  requireApiAuth,
  syncUserToDb,
  requireNotebookRole('viewer'),
  validateParams(notebookIdSchema),
  validateQuery(listSourcesQuerySchema),
  async (req, res, next) => {
    try {
      const result = await sourceService.listSources(req.notebook!.id, req.query as never)
      res.json(success(result, req.requestId))
    } catch (err) {
      next(err)
    }
  }
)

// POST /api/v1/notebooks/:id/sources/url — editor+ (spec §68: low limit)
router.post(
  '/notebooks/:id/sources/url',
  requireApiAuth,
  syncUserToDb,
  requireNotebookRole('editor'),
  urlIngestionLimiter,
  validateParams(notebookIdSchema),
  validateBody(addUrlSchema),
  async (req, res, next) => {
    try {
      const source = await sourceService.addUrlSource(req.notebook!.id, req.user!.id, req.body, {
        requestId: req.requestId,
      })
      res.status(201).json(success(source, req.requestId))
    } catch (err) {
      next(err)
    }
  }
)

// POST /api/v1/notebooks/:id/sources/text — editor+
router.post(
  '/notebooks/:id/sources/text',
  requireApiAuth,
  syncUserToDb,
  requireNotebookRole('editor'),
  validateParams(notebookIdSchema),
  validateBody(addTextSchema),
  async (req, res, next) => {
    try {
      const source = await sourceService.addTextSource(req.notebook!.id, req.user!.id, req.body, {
        requestId: req.requestId,
      })
      res.status(201).json(success(source, req.requestId))
    } catch (err) {
      next(err)
    }
  }
)

// POST /api/v1/notebooks/:id/sources/upload-intent — editor+
router.post(
  '/notebooks/:id/sources/upload-intent',
  requireApiAuth,
  syncUserToDb,
  requireNotebookRole('editor'),
  uploadLimiter,
  validateParams(notebookIdSchema),
  validateBody(uploadIntentSchema),
  async (req, res, next) => {
    try {
      const intent = await sourceService.createUploadIntent(req.notebook!.id, req.user!.id, req.body)
      res.status(201).json(success(intent, req.requestId))
    } catch (err) {
      next(err)
    }
  }
)

// POST /api/v1/notebooks/:id/sources/upload-complete — editor+
router.post(
  '/notebooks/:id/sources/upload-complete',
  requireApiAuth,
  syncUserToDb,
  requireNotebookRole('editor'),
  validateParams(notebookIdSchema),
  validateBody(uploadCompleteSchema),
  async (req, res, next) => {
    try {
      const source = await sourceService.completeUpload(req.notebook!.id, req.user!.id, req.body, {
        requestId: req.requestId,
      })
      res.status(201).json(success(source, req.requestId))
    } catch (err) {
      next(err)
    }
  }
)

// POST /api/v1/notebooks/:id/sources/select — editor+
router.post(
  '/notebooks/:id/sources/select',
  requireApiAuth,
  syncUserToDb,
  requireNotebookRole('editor'),
  validateParams(notebookIdSchema),
  validateBody(batchSelectSchema),
  async (req, res, next) => {
    try {
      const result = await sourceService.batchSelect(req.notebook!.id, req.body.sourceIds, req.body.selected)
      res.json(success(result, req.requestId))
    } catch (err) {
      next(err)
    }
  }
)

// GET /api/v1/sources/:sourceId
router.get(
  '/sources/:sourceId',
  requireApiAuth,
  syncUserToDb,
  validateParams(sourceIdSchema),
  async (req, res, next) => {
    try {
      const source = await sourceService.getSource(req.params.sourceId, req.user!.id)
      if (!source) return next(notFound('Source not found'))
      res.json(success(source, req.requestId))
    } catch (err) {
      next(err)
    }
  }
)

// PATCH /api/v1/sources/:sourceId — editor+
router.patch(
  '/sources/:sourceId',
  requireApiAuth,
  syncUserToDb,
  validateParams(sourceIdSchema),
  validateBody(updateSourceSchema),
  async (req, res, next) => {
    try {
      const source = await sourceService.updateSource(req.params.sourceId, req.user!.id, req.body)
      if (!source) return next(notFound('Source not found or access denied'))
      res.json(success(source, req.requestId))
    } catch (err) {
      next(err)
    }
  }
)

// DELETE /api/v1/sources/:sourceId — editor+
router.delete(
  '/sources/:sourceId',
  requireApiAuth,
  syncUserToDb,
  validateParams(sourceIdSchema),
  async (req, res, next) => {
    try {
      const deleted = await sourceService.softDeleteSource(req.params.sourceId, req.user!.id)
      if (!deleted) return next(notFound('Source not found or access denied'))
      res.status(204).send()
    } catch (err) {
      next(err)
    }
  }
)

// POST /api/v1/sources/:sourceId/retry — editor+
router.post(
  '/sources/:sourceId/retry',
  requireApiAuth,
  syncUserToDb,
  retryLimiter,
  validateParams(sourceIdSchema),
  async (req, res, next) => {
    try {
      const source = await sourceService.retrySource(req.params.sourceId, req.user!.id, {
        requestId: req.requestId,
      })
      if (!source) return next(notFound('Source not found, not in failed state, or access denied'))
      res.json(success(source, req.requestId))
    } catch (err) {
      next(err)
    }
  }
)

export default router
