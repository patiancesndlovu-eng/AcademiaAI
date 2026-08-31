import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import { success } from '../utils/response'

const router = Router()

// POST /api/v1/auth/logout
router.post('/logout', requireAuth, async (req, res) => {
  // Clerk handles session revocation client-side or via webhooks.
  // Backend can clear any local state if needed.
  res.json(success({ loggedOut: true }, req.requestId))
})

export default router