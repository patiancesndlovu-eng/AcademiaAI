import { Router } from 'express'
import multer from 'multer'
import { requireApiAuth, syncUserToDb } from '../middleware/auth'
import { uploadLimiter } from '../middleware/rateLimit'
import { env } from '../config/env'
import { consumeIntentForUpload } from '../services/uploadIntent'
import { success } from '../utils/response'

const router = Router()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_FILE_SIZE, files: 1 },
})

/**
 * POST /api/v1/internal/upload?path=...
 *
 * Accepts a multipart upload only when `path` matches a registered,
 * unconsumed upload intent issued to this user (spec §24). The client-
 * supplied path is never used to touch the filesystem directly — the intent
 * registry (Redis, TTL'd) is the gate, and magic bytes must match the
 * declared type (spec §22).
 */
router.post(
  '/',
  requireApiAuth,
  syncUserToDb,
  uploadLimiter,
  upload.single('file'),
  async (req, res, next) => {
    try {
      const filePath = typeof req.query.path === 'string' ? req.query.path : ''
      if (!filePath) {
        return res.status(400).json({
          data: null,
          meta: { requestId: req.requestId },
          error: { code: 'BAD_REQUEST', message: 'Missing path parameter', retryable: false },
        })
      }
      if (!req.file) {
        return res.status(400).json({
          data: null,
          meta: { requestId: req.requestId },
          error: { code: 'BAD_REQUEST', message: 'No file uploaded', retryable: false },
        })
      }

      const intent = await consumeIntentForUpload(filePath, req.user!.id, req.file.buffer)

      res.json(
        success({ filePath, size: req.file.size, kind: intent.kind }, req.requestId)
      )
    } catch (err) {
      next(err)
    }
  }
)

export default router
