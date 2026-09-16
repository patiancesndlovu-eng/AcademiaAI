import { Router } from 'express'
import { z } from 'zod'
import { requireApiAuth, syncUserToDb } from '../middleware/auth'
import { requireNotebookRole } from '../middleware/authorization'
import { validateBody, validateParams } from '../middleware/validateRequest'
import { success } from '../utils/response'
import { prisma } from '../config/db'
import { conflict, notFound } from '../utils/errors'
import { enqueueGeneration } from '../queues/queues'
import { generationConfigSchema } from '../schemas/generation'

const router = Router({ mergeParams: true })

const notebookIdSchema = z.object({ id: z.string().cuid() })
const jobIdSchema = z.object({ id: z.string().cuid(), jobId: z.string().cuid() })

// POST /api/v1/notebooks/:id/generations
router.post(
  '/notebooks/:id/generations',
  requireApiAuth,
  syncUserToDb,
  requireNotebookRole('editor'),
  validateParams(notebookIdSchema),
  validateBody(generationConfigSchema),
  async (req, res, next) => {
    try {
      const { type, config } = req.body

      const job = await prisma.generationJob.create({
        data: {
          notebookId: req.notebook!.id,
          requestedBy: req.user!.id,
          type,
          config: config as never,
        },
      })

      await enqueueGeneration({ jobId: job.id, notebookId: req.notebook!.id, requestedBy: req.user!.id })

      res.status(202).json(success({ jobId: job.id }, req.requestId))
    } catch (err) {
      next(err)
    }
  }
)

// GET /api/v1/notebooks/:id/generations
router.get(
  '/notebooks/:id/generations',
  requireApiAuth,
  syncUserToDb,
  requireNotebookRole('viewer'),
  validateParams(notebookIdSchema),
  async (req, res, next) => {
    try {
      const jobs = await prisma.generationJob.findMany({
        where: { notebookId: req.notebook!.id },
        orderBy: { createdAt: 'desc' },
      })
      res.json(success(jobs, req.requestId))
    } catch (err) {
      next(err)
    }
  }
)

// GET /api/v1/notebooks/:id/generations/:jobId
router.get(
  '/notebooks/:id/generations/:jobId',
  requireApiAuth,
  syncUserToDb,
  requireNotebookRole('viewer'),
  validateParams(jobIdSchema),
  async (req, res, next) => {
    try {
      const job = await prisma.generationJob.findUnique({
        where: { id: req.params.jobId },
        include: { output: true },
      })
      if (!job || job.notebookId !== req.notebook!.id) return next(notFound('Generation job not found'))
      res.json(success(job, req.requestId))
    } catch (err) {
      next(err)
    }
  }
)

// POST /api/v1/notebooks/:id/generations/:jobId/cancel — race-safe cancellation (spec §62)
router.post(
  '/notebooks/:id/generations/:jobId/cancel',
  requireApiAuth,
  syncUserToDb,
  requireNotebookRole('editor'),
  validateParams(jobIdSchema),
  async (req, res, next) => {
    try {
      const updated = await prisma.generationJob.updateMany({
        where: {
          id: req.params.jobId,
          notebookId: req.notebook!.id,
          status: { in: ['queued', 'processing'] },
        },
        data: { status: 'cancelled', updatedAt: new Date() },
      })
      if (updated.count === 0) return next(notFound('Job not found or not cancellable'))
      res.status(204).send()
    } catch (err) {
      next(err)
    }
  }
)

export default router