import { Router } from 'express'
import { z } from 'zod'
import { requireApiAuth, syncUserToDb } from '../middleware/auth'
import { requireNotebookRole } from '../middleware/authorization'
import { validateBody, validateParams } from '../middleware/validateRequest'
import { success } from '../utils/response'
import { prisma } from '../config/db'
import { notFound } from '../utils/errors'

const router = Router({ mergeParams: true })

const notebookIdSchema = z.object({ id: z.string().cuid() })
const noteParamsSchema = z.object({ id: z.string().cuid(), noteId: z.string().cuid() })
const createNoteSchema = z.object({ body: z.string().min(1), sourceIds: z.array(z.string().cuid()).optional().default([]) })
const updateNoteSchema = z.object({ body: z.string().min(1).optional(), sourceIds: z.array(z.string().cuid()).optional() })

// GET /api/v1/notebooks/:id/notes
router.get('/notebooks/:id/notes', requireApiAuth, syncUserToDb, requireNotebookRole('viewer'), validateParams(notebookIdSchema), async (req, res, next) => {
  try {
    const notes = await prisma.note.findMany({
      where: { notebookId: req.notebook!.id },
      orderBy: { createdAt: 'desc' }
    })
    res.json(success(notes, req.requestId))
  } catch (err) {
    next(err)
  }
})

// POST /api/v1/notebooks/:id/notes
router.post('/notebooks/:id/notes', requireApiAuth, syncUserToDb, requireNotebookRole('editor'), validateParams(notebookIdSchema), validateBody(createNoteSchema), async (req, res, next) => {
  try {
    const note = await prisma.note.create({
      data: {
        notebookId: req.notebook!.id,
        authorId: req.user!.id,
        body: req.body.body,
        sourceIds: req.body.sourceIds
      }
    })
    res.status(201).json(success(note, req.requestId))
  } catch (err) {
    next(err)
  }
})

// PATCH /api/v1/notebooks/:id/notes/:noteId
router.patch('/notebooks/:id/notes/:noteId', requireApiAuth, syncUserToDb, requireNotebookRole('editor'), validateParams(noteParamsSchema), validateBody(updateNoteSchema), async (req, res, next) => {
  try {
    const existing = await prisma.note.findUnique({ where: { id: req.params.noteId } })
    if (!existing || existing.notebookId !== req.notebook!.id) return next(notFound('Note not found'))
    
    const note = await prisma.note.update({
      where: { id: req.params.noteId },
      data: { body: req.body.body, sourceIds: req.body.sourceIds }
    })
    res.json(success(note, req.requestId))
  } catch (err) {
    next(err)
  }
})

// DELETE /api/v1/notebooks/:id/notes/:noteId
router.delete('/notebooks/:id/notes/:noteId', requireApiAuth, syncUserToDb, requireNotebookRole('editor'), validateParams(noteParamsSchema), async (req, res, next) => {
  try {
    const existing = await prisma.note.findUnique({ where: { id: req.params.noteId } })
    if (!existing || existing.notebookId !== req.notebook!.id) return next(notFound('Note not found'))

    await prisma.note.delete({ where: { id: req.params.noteId } })
    res.status(204).send()
  } catch (err) {
    next(err)
  }
})

export default router
