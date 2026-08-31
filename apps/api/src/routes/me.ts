import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, syncUserToDb } from '../middleware/auth'
import { validateBody } from '../middleware/validateRequest'
import { success, error } from '../utils/response'
import * as userService from '../services/user'

const router = Router()

const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  avatarUrl: z.string().url().optional(),
})

// GET /api/v1/me
router.get('/', requireAuth, syncUserToDb, async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json(error('UNAUTHORIZED', 'User not found', false, req.requestId))
    }

    const user = await userService.getUserById(req.user.id)
    if (!user) {
      return res.status(404).json(error('NOT_FOUND', 'User not found', false, req.requestId))
    }

    res.json(
      success({
        id: user.id,
        clerkId: user.clerkId,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      }, req.requestId)
    )
  } catch (err) {
    next(err)
  }
})

// PATCH /api/v1/me
router.patch('/', requireAuth, syncUserToDb, validateBody(updateProfileSchema), async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json(error('UNAUTHORIZED', 'User not found', false, req.requestId))
    }

    const updated = await userService.updateUser(req.user.id, req.body)
    res.json(success(updated, req.requestId))
  } catch (err) {
    next(err)
  }
})

export default router