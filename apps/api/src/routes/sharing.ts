import { Router } from 'express'
import { z } from 'zod'
import { requireApiAuth, syncUserToDb } from '../middleware/auth'
import { requireNotebookRole } from '../middleware/authorization'
import { validateBody, validateParams } from '../middleware/validateRequest'
import { success } from '../utils/response'
import { prisma } from '../config/db'
import { conflict, notFound } from '../utils/errors'
import { invalidateNotebookCache } from '../cache/invalidation'

const router = Router({ mergeParams: true }) // merged to get :id from parent if needed, or we just put it in the path

const notebookIdSchema = z.object({ id: z.string().cuid() })
const addMemberSchema = z.object({ email: z.string().email(), role: z.enum(['viewer', 'editor', 'owner']) })

// POST /api/v1/notebooks/:id/members
router.post('/notebooks/:id/members', requireApiAuth, syncUserToDb, requireNotebookRole('owner'), validateParams(notebookIdSchema), validateBody(addMemberSchema), async (req, res, next) => {
  try {
    const { email, role } = req.body
    const userToInvite = await prisma.user.findUnique({ where: { email } })
    if (!userToInvite) return next(notFound('User not found'))

    const member = await prisma.notebookMember.create({
      data: { notebookId: req.notebook!.id, userId: userToInvite.id, role: role as any }
    }).catch(e => {
      if (e.code === 'P2002') throw conflict('User is already a member')
      throw e
    })
    
    invalidateNotebookCache(req.notebook!.id)
    res.status(201).json(success(member, req.requestId))
  } catch (err) {
    next(err)
  }
})

// DELETE /api/v1/notebooks/:id/members/:userId
router.delete('/notebooks/:id/members/:userId', requireApiAuth, syncUserToDb, requireNotebookRole('owner'), validateParams(z.object({ id: z.string().cuid(), userId: z.string().cuid() })), async (req, res, next) => {
  try {
    await prisma.notebookMember.delete({
      where: { notebookId_userId: { notebookId: req.notebook!.id, userId: req.params.userId } }
    }).catch(() => null)
    
    invalidateNotebookCache(req.notebook!.id)
    res.status(204).send()
  } catch (err) {
    next(err)
  }
})

export default router
