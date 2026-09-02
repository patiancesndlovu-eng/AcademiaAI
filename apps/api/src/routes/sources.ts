import { Router } from 'express'
import { z } from 'zod'
import { requireApiAuth, syncUserToDb } from '../middleware/auth'
import { validateBody, validateParams, validateQuery } from '../middleware/validateRequest'
import { success, error } from '../utils/response'
import * as sourceService from '../services/sources'
import * as notebookService from '../services/notebook'

const router = Router()

const notebookIdSchema = z.object({ id: z.string().cuid() })
const sourceIdSchema = z.object({ sourceId: z.string().cuid() })

const listSourcesQuerySchema = z.object({
  status: z.enum(['queued', 'processing', 'ready', 'failed']).optional(),
  search: z.string().max(100).optional(),
  page: z.string().transform(Number).optional(),
  pageSize: z.string().transform(Number).optional(),
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
  size: z.number().int().min(1).max(10485760), // 10MB
})

const uploadCompleteSchema = z.object({
  filePath: z.string().min(1).max(500),
  originalName: z.string().min(1).max(255),
})

const batchSelectSchema = z.object({
  sourceIds: z.array(z.string().cuid()).min(1),
  selected: z.boolean(),
})

const updateSourceSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  selected: z.boolean().optional(),
})

// GET /api/v1/notebooks/:id/sources
router.get(
  '/notebooks/:id/sources',
  requireApiAuth,
  syncUserToDb,
  validateParams(notebookIdSchema),
  validateQuery(listSourcesQuerySchema),
  async (req, res, next) => {
    try {
      if (!req.user) return res.status(401).json(error('UNAUTHORIZED', 'Authentication required', false, req.requestId))

      const membership = await notebookService.getMembership(req.params.id, req.user.id)
      if (!membership.isMember) {
        return res.status(403).json(error('FORBIDDEN', 'Access denied', false, req.requestId))
      }

      const result = await sourceService.listSources(req.params.id, req.query as any)
      res.json(success(result, req.requestId))
    } catch (err) {
      next(err)
    }
  }
)

// POST /api/v1/notebooks/:id/sources/url
router.post(
  '/notebooks/:id/sources/url',
  requireApiAuth,
  syncUserToDb,
  validateParams(notebookIdSchema),
  validateBody(addUrlSchema),
  async (req, res, next) => {
    try {
      if (!req.user) return res.status(401).json(error('UNAUTHORIZED', 'Authentication required', false, req.requestId))

      const membership = await notebookService.getMembership(req.params.id, req.user.id)
      if (!membership.isMember) {
        return res.status(403).json(error('FORBIDDEN', 'Access denied', false, req.requestId))
      }

      const source = await sourceService.addUrlSource(req.params.id, req.user.id, req.body)
      res.status(201).json(success(source, req.requestId))
    } catch (err) {
      next(err)
    }
  }
)

// POST /api/v1/notebooks/:id/sources/text
router.post(
  '/notebooks/:id/sources/text',
  requireApiAuth,
  syncUserToDb,
  validateParams(notebookIdSchema),
  validateBody(addTextSchema),
  async (req, res, next) => {
    try {
      if (!req.user) return res.status(401).json(error('UNAUTHORIZED', 'Authentication required', false, req.requestId))

      const membership = await notebookService.getMembership(req.params.id, req.user.id)
      if (!membership.isMember) {
        return res.status(403).json(error('FORBIDDEN', 'Access denied', false, req.requestId))
      }

      const source = await sourceService.addTextSource(req.params.id, req.body)
      res.status(201).json(success(source, req.requestId))
    } catch (err) {
      next(err)
    }
  }
)

// POST /api/v1/notebooks/:id/sources/upload-intent
router.post(
  '/notebooks/:id/sources/upload-intent',
  requireApiAuth,
  syncUserToDb,
  validateParams(notebookIdSchema),
  validateBody(uploadIntentSchema),
  async (req, res, next) => {
    try {
      if (!req.user) return res.status(401).json(error('UNAUTHORIZED', 'Authentication required', false, req.requestId))

      const membership = await notebookService.getMembership(req.params.id, req.user.id)
      if (!membership.isMember) {
        return res.status(403).json(error('FORBIDDEN', 'Access denied', false, req.requestId))
      }

      const intent = await sourceService.createUploadIntent(req.params.id, req.body)
      res.status(201).json(success(intent, req.requestId))
    } catch (err) {
      next(err)
    }
  }
)

// POST /api/v1/notebooks/:id/sources/upload-complete
router.post(
  '/notebooks/:id/sources/upload-complete',
  requireApiAuth,
  syncUserToDb,
  validateParams(notebookIdSchema),
  validateBody(uploadCompleteSchema),
  async (req, res, next) => {
    try {
      if (!req.user) return res.status(401).json(error('UNAUTHORIZED', 'Authentication required', false, req.requestId))

      const membership = await notebookService.getMembership(req.params.id, req.user.id)
      if (!membership.isMember) {
        return res.status(403).json(error('FORBIDDEN', 'Access denied', false, req.requestId))
      }

      const source = await sourceService.completeUpload(req.params.id, req.user.id, req.body)
      res.status(201).json(success(source, req.requestId))
    } catch (err) {
      next(err)
    }
  }
)

// POST /api/v1/notebooks/:id/sources/select
router.post(
  '/notebooks/:id/sources/select',
  requireApiAuth,
  syncUserToDb,
  validateParams(notebookIdSchema),
  validateBody(batchSelectSchema),
  async (req, res, next) => {
    try {
      if (!req.user) return res.status(401).json(error('UNAUTHORIZED', 'Authentication required', false, req.requestId))

      const membership = await notebookService.getMembership(req.params.id, req.user.id)
      if (!membership.isMember) {
        return res.status(403).json(error('FORBIDDEN', 'Access denied', false, req.requestId))
      }

      const result = await sourceService.batchSelect(req.params.id, req.body.sourceIds, req.body.selected)
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
      if (!req.user) return res.status(401).json(error('UNAUTHORIZED', 'Authentication required', false, req.requestId))

      const source = await sourceService.getSource(req.params.sourceId, req.user.id)
      if (!source) {
        return res.status(404).json(error('NOT_FOUND', 'Source not found', false, req.requestId))
      }

      res.json(success(source, req.requestId))
    } catch (err) {
      next(err)
    }
  }
)

// PATCH /api/v1/sources/:sourceId
router.patch(
  '/sources/:sourceId',
  requireApiAuth,
  syncUserToDb,
  validateParams(sourceIdSchema),
  validateBody(updateSourceSchema),
  async (req, res, next) => {
    try {
      if (!req.user) return res.status(401).json(error('UNAUTHORIZED', 'Authentication required', false, req.requestId))

      const source = await sourceService.updateSource(req.params.sourceId, req.user.id, req.body)
      if (!source) {
        return res.status(404).json(error('NOT_FOUND', 'Source not found or access denied', false, req.requestId))
      }

      res.json(success(source, req.requestId))
    } catch (err) {
      next(err)
    }
  }
)

// DELETE /api/v1/sources/:sourceId
router.delete(
  '/sources/:sourceId',
  requireApiAuth,
  syncUserToDb,
  validateParams(sourceIdSchema),
  async (req, res, next) => {
    try {
      if (!req.user) return res.status(401).json(error('UNAUTHORIZED', 'Authentication required', false, req.requestId))

      const result = await sourceService.softDeleteSource(req.params.sourceId, req.user.id)
      if (!result) {
        return res.status(404).json(error('NOT_FOUND', 'Source not found or access denied', false, req.requestId))
      }

      res.status(204).send()
    } catch (err) {
      next(err)
    }
  }
)

// POST /api/v1/sources/:sourceId/retry
router.post(
  '/sources/:sourceId/retry',
  requireApiAuth,
  syncUserToDb,
  validateParams(sourceIdSchema),
  async (req, res, next) => {
    try {
      if (!req.user) return res.status(401).json(error('UNAUTHORIZED', 'Authentication required', false, req.requestId))

      const source = await sourceService.retrySource(req.params.sourceId, req.user.id)
      if (!source) {
        return res.status(404).json(error('NOT_FOUND', 'Source not found or access denied', false, req.requestId))
      }

      res.json(success(source, req.requestId))
    } catch (err) {
      next(err)
    }
  }
)

export default router
