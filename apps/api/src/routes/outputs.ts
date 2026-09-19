import { Router } from 'express'
import { z } from 'zod'
import { requireApiAuth, syncUserToDb } from '../middleware/auth'
import { requireNotebookRole } from '../middleware/authorization'
import { validateParams } from '../middleware/validateRequest'
import { success } from '../utils/response'
import { prisma } from '../config/db'
import { notFound } from '../utils/errors'

const router = Router({ mergeParams: true })
const notebookIdSchema = z.object({ id: z.string().cuid(), outputId: z.string().cuid() })

// GET /api/v1/notebooks/:id/outputs/:outputId
router.get('/notebooks/:id/outputs/:outputId', requireApiAuth, syncUserToDb, requireNotebookRole('viewer'), validateParams(notebookIdSchema), async (req, res, next) => {
  try {
    const output = await prisma.output.findUnique({ where: { id: req.params.outputId } })
    if (!output || output.notebookId !== req.notebook!.id) return next(notFound('Output not found'))
    res.json(success(output, req.requestId))
  } catch (err) {
    next(err)
  }
})

export default router
