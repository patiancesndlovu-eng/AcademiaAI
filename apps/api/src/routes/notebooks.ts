import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, syncUserToDb } from '../middleware/auth'
import { validateBody, validateParams, validateQuery } from '../middleware/validateRequest'
import { success, error } from '../utils/response'
import * as notebookService from '../services/notebook'

const router = Router()

const listQuerySchema = z.object({
  scope: z.enum(['owned', 'shared', 'all']).optional().default('all'),
  sort: z.enum(['updated', 'created']).optional().default('updated'),
  search: z.string().optional(),
})

const createSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  visibility: z.enum(['private', 'shared', 'public']).optional().default('private'),
})

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  visibility: z.enum(['private', 'shared', 'public']).optional(),
})

const notebookIdSchema = z.object({
  id: z.string().cuid(),
})

function mapNotebook(n: any) {
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

// GET /api/v1/notebooks
router.get('/', requireAuth, syncUserToDb, validateQuery(listQuerySchema), async (req, res, next) => {
  try {
    if (!req.user) return res.status(401).json(error('UNAUTHORIZED', 'Authentication required'))

    const notebooks = await notebookService.listNotebooks(req.user.id, req.query as any)
    res.json(success(notebooks.map(mapNotebook)))
  } catch (err) {
    next(err)
  }
})

// POST /api/v1/notebooks
router.post('/', requireAuth, syncUserToDb, validateBody(createSchema), async (req, res, next) => {
  try {
    if (!req.user) return res.status(401).json(error('UNAUTHORIZED', 'Authentication required'))

    const notebook = await notebookService.createNotebook(req.user.id, req.body)
    res.status(201).json(success(mapNotebook(notebook)))
  } catch (err) {
    next(err)
  }
})

// GET /api/v1/notebooks/:id
router.get('/:id', requireAuth, syncUserToDb, validateParams(notebookIdSchema), async (req, res, next) => {
  try {
    if (!req.user) return res.status(401).json(error('UNAUTHORIZED', 'Authentication required'))

    const notebook = await notebookService.getNotebook(req.params.id, req.user.id)
    if (!notebook) {
      return res.status(404).json(error('NOT_FOUND', 'Notebook not found'))
    }

    res.json(
      success({
        ...mapNotebook(notebook),
        settingsJson: notebook.settingsJson,
        members: notebook.members.map((m: any) => ({
          id: m.id,
          userId: m.userId,
          role: m.role,
          user: m.user,
        })),
      })
    )
  } catch (err) {
    next(err)
  }
})

// PATCH /api/v1/notebooks/:id
router.patch(
  '/:id',
  requireAuth,
  syncUserToDb,
  validateParams(notebookIdSchema),
  validateBody(updateSchema),
  async (req, res, next) => {
    try {
      if (!req.user) return res.status(401).json(error('UNAUTHORIZED', 'Authentication required'))

      const notebook = await notebookService.updateNotebook(req.params.id, req.user.id, req.body)
      if (!notebook) {
        return res.status(404).json(error('NOT_FOUND', 'Notebook not found or access denied'))
      }

      res.json(success(mapNotebook(notebook)))
    } catch (err) {
      next(err)
    }
  }
)

// DELETE /api/v1/notebooks/:id
router.delete('/:id', requireAuth, syncUserToDb, validateParams(notebookIdSchema), async (req, res, next) => {
  try {
    if (!req.user) return res.status(401).json(error('UNAUTHORIZED', 'Authentication required'))

    const result = await notebookService.softDeleteNotebook(req.params.id, req.user.id)
    if (!result) {
      return res.status(404).json(error('NOT_FOUND', 'Notebook not found or access denied'))
    }

    res.status(204).send()
  } catch (err) {
    next(err)
  }
})

// POST /api/v1/notebooks/:id/copy
router.post('/:id/copy', requireAuth, syncUserToDb, validateParams(notebookIdSchema), async (req, res, next) => {
  try {
    if (!req.user) return res.status(401).json(error('UNAUTHORIZED', 'Authentication required'))

    const notebook = await notebookService.duplicateNotebook(req.params.id, req.user.id)
    if (!notebook) {
      return res.status(404).json(error('NOT_FOUND', 'Notebook not found'))
    }

    res.status(201).json(success(mapNotebook(notebook)))
  } catch (err) {
    next(err)
  }
})

// GET /api/v1/notebooks/:id/membership
router.get('/:id/membership', requireAuth, syncUserToDb, validateParams(notebookIdSchema), async (req, res, next) => {
  try {
    if (!req.user) return res.status(401).json(error('UNAUTHORIZED', 'Authentication required'))

    const membership = await notebookService.getMembership(req.params.id, req.user.id)
    res.json(success(membership))
  } catch (err) {
    next(err)
  }
})

export default router