import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import dotenv from 'dotenv'
import { clerkMiddleware } from '@clerk/express'
import rateLimit from 'express-rate-limit'
import { env } from './config/env'
import { prisma } from './config/db'
import { requestIdMiddleware } from './middleware/requestId'
import { errorHandler } from './middleware/errorHandler'
import meRoutes from './routes/me'
import authRoutes from './routes/auth'
import notebookRoutes from './routes/notebooks'
import sourceRoutes from './routes/sources'

dotenv.config()

const app = express()
const PORT = env.PORT

// Trust proxy (required for rate-limit behind reverse proxy)
app.set('trust proxy', 1)

// Security
app.use(helmet())
app.use(cors({ origin: env.FRONTEND_URL, credentials: true }))

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip || 'anonymous',
  handler: (_req, res) => {
    res.status(429).json({
      data: null,
      meta: { requestId: 'req_unknown' },
      error: { code: 'RATE_LIMITED', message: 'Too many requests, please slow down.', retryable: true },
    })
  },
})

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
})

app.use(morgan('dev'))
app.use(requestIdMiddleware)
app.use(express.json({ limit: '10mb' }))
app.use(clerkMiddleware())

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Phase 1 routes
app.use('/api/v1/auth', authLimiter, authRoutes)
app.use('/api/v1/me', apiLimiter, meRoutes)
app.use('/api/v1/notebooks', apiLimiter, notebookRoutes)
app.use('/api/v1', apiLimiter, sourceRoutes) // mounts /notebooks/:id/sources and /sources/*

// 404
app.use((_req, res) => {
  res.status(404).json({
    data: null,
    meta: { requestId: 'req_unknown' },
    error: { code: 'NOT_FOUND', message: 'Endpoint not found', retryable: false },
  })
})

// Global error handler
app.use(errorHandler)

const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})

// Graceful shutdown
const shutdown = async (signal: string) => {
  console.log(`Received ${signal}. Shutting down gracefully...`)
  server.close(async () => {
    await prisma.$disconnect()
    console.log('Prisma disconnected. Exiting.')
    process.exit(0)
  })
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))