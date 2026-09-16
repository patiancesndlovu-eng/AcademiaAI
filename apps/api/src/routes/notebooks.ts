import { Router } from 'express'
import { z } from 'zod'
import { NotebookVisibility } from '@prisma/client'
import { requireApiAuth, syncUserToDb } from '../middleware/auth'
import { requireNotebookRole } from '../middleware/authorization'
import { validateBody, validateParams, validateQuery } from '../middleware/validateRequest'
import { success } from '../utils/response'
import { forbidden, notFound } from '../utils/errors'
import * as notebookService from '../services/notebook'
import { invalidateNotebookCache, invalidateNotebookListCache } from '../cache/invalidation'

const router = Router()

const listQuerySchema = z.object({
  scope: z.enum(['owned', 'shared', 'all']).optional().default('all'),
  sort: z.enum(['updated', 'created']).optional().default('updated'),
  search: z.string().max(100).optional(),
})

const createSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  visibility: z.enum(['private', 'shared', 'public']).optional().default('private'),
})

const updateSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
    visibility: z.enum(['private', 'shared', 'public']).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field is required' })

const notebookIdSchema = z.object({ id: z.string().cuid() })

function mapNotebook(n: {
  id: string
  ownerId: string
  title: string
  description: string | null
  visibility: string
  createdAt: Date
  updatedAt: Date
  _count?: { sources: number }
}) {
  return {
    id: n.id,
    ownerId: n.ownerId,
    title: n.title,
    description: n.description,
    visibility: n.visibility,
    sourceCount: n._count?.sources ?? 0,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
  }
}

// GET /api/v1/notebooks — membership-scoped list (array contract kept for the frontend)
router.get(
  '/',
  requireApiAuth,
  syncUserToDb,
  validateQuery(listQuerySchema),
  async (req, res, next) => {
    try {
      const notebooks = await notebookService.listNotebooks(req.user!.id, req.query as never)
      res.json(success(notebooks.map(mapNotebook), req.requestId))
    } catch (err) {
      next(err)
    }
  }
)

// POST /api/v1/notebooks
router.post(
  '/',
  requireApiAuth,
  syncUserToDb,
  validateBody(createSchema),
  async (req, res, next) => {
    try {
      const notebook = await notebookService.createNotebook(
        req.user!.id,
        req.body as { title: string; description?: string; visibility?: NotebookVisibility }
      )
      invalidateNotebookListCache(req.user!.id)
      res.status(201).json(success(mapNotebook(notebook), req.requestId))
    } catch (err) {
      next(err)
    }
  }
)

// GET /api/v1/notebooks/:id — viewer+
router.get(
  '/:id',
  requireApiAuth,
  syncUserToDb,
  requireNotebookRole('viewer'),
  validateParams(notebookIdSchema),
  async (req, res, next) => {
    try {
      const notebook = await notebookService.getNotebook(req.notebook!.id, req.user!.id)
      if (!notebook) return next(notFound('Notebook not found'))
      res.json(
        success(
          {
            ...mapNotebook(notebook),
            settingsJson: notebook.settingsJson,
            myRole: req.role,
            members: notebook.members.map((m: { id: string; userId: string; role: string; user: unknown }) => ({
              id: m.id,
              userId: m.userId,
              role: m.role,
              user: m.user,
            })),
          },
          req.requestId
        )
      )
    } catch (err) {
      next(err)
    }
  }
)

// PATCH /api/v1/notebooks/:id — editor+; visibility changes are owner-only (spec §10)
router.patch(
  '/:id',
  requireApiAuth,
  syncUserToDb,
  requireNotebookRole('editor'),
  validateParams(notebookIdSchema),
  validateBody(updateSchema),
  async (req, res, next) => {
    try {
      if (req.body.visibility !== undefined && req.role !== 'owner') {
        return next(forbidden('Only the notebook owner can change visibility'))
      }
      const notebook = await notebookService.updateNotebook(
        req.notebook!.id,
        req.user!.id,
        req.body as { title?: string; description?: string; visibility?: NotebookVisibility }
      )
      if (!notebook) return next(notFound('Notebook not found'))
      invalidateNotebookCache(notebook.id)
      invalidateNotebookListCache(req.user!.id)
      res.json(success(mapNotebook(notebook), req.requestId))
    } catch (err) {
      next(err)
    }
  }
)

// DELETE /api/v1/notebooks/:id — owner only (soft delete, spec §19)
router.delete(
  '/:id',
  requireApiAuth,
  syncUserToDb,
  requireNotebookRole('owner'),
  validateParams(notebookIdSchema),
  async (req, res, next) => {
    try {
      const deleted = await notebookService.softDeleteNotebook(req.notebook!.id, req.user!.id)
      if (!deleted) return next(notFound('Notebook not found'))
      invalidateNotebookCache(deleted.id, deleted.ownerId)
      invalidateNotebookListCache(req.user!.id)
      res.status(204).send()
    } catch (err) {
      next(err)
    }
  }
)

// POST /api/v1/notebooks/:id/copy — viewer+ (copies metadata for the caller)
router.post(
  '/:id/copy',
  requireApiAuth,
  syncUserToDb,
  requireNotebookRole('viewer'),
  validateParams(notebookIdSchema),
  async (req, res, next) => {
    try {
      const notebook = await notebookService.duplicateNotebook(req.notebook!.id, req.user!.id)
      if (!notebook) return next(notFound('Notebook not found'))
      invalidateNotebookListCache(req.user!.id)
      res.status(201).json(success(mapNotebook(notebook), req.requestId))
    } catch (err) {
      next(err)
    }
  }
)

// GET /api/v1/notebooks/:id/membership — viewer+
router.get(
  '/:id/membership',
  requireApiAuth,
  syncUserToDb,
  requireNotebookRole('viewer'),
  validateParams(notebookIdSchema),
  async (req, res, next) => {
    try {
      const membership = await notebookService.getMembership(req.notebook!.id, req.user!.id)
      res.json(success(membership, req.requestId))
    } catch (err) {
      next(err)
    }
  }
)

export default router
