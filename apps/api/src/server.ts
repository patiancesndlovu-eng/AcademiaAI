import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import dotenv from 'dotenv'
import { clerkMiddleware } from '@clerk/express'
import { env } from './config/env'
import { prisma } from './config/db'
import { cacheRedis, isRedisHealthy, disconnectRedis, warmCacheConnection } from './config/redis'
import { closeQueues } from './queues/queues'
import { requestIdMiddleware } from './middleware/requestId'
import { requestLoggingMiddleware } from './middleware/logging'
import { errorHandler } from './middleware/errorHandler'
import { globalLimiter, authLimiter } from './middleware/rateLimit'
import meRoutes from './routes/me'
import authRoutes from './routes/auth'
import notebookRoutes from './routes/notebooks'
import sourceRoutes from './routes/sources'
import chatRoutes from './routes/chat'
import uploadRouter from './routes/upload'

dotenv.config()

const app = express()
const PORT = env.PORT

// Trust proxy (required for correct IPs behind a reverse proxy)
app.set('trust proxy', 1)

// ─── Security headers + CORS (spec §81/§82) ───
app.use(helmet())
app.use(
  cors({
    origin: env.FRONTEND_URL.split(',').map((o) => o.trim()),
    credentials: true,
  })
)

// ─── Observability ───
app.use(requestIdMiddleware)
app.use(requestLoggingMiddleware)

app.use(express.json({ limit: '10mb' }))
app.use(clerkMiddleware())

// ─── Health checks (spec §87) — cheap, unauthenticated ───
app.get('/health/live', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.get('/health/ready', async (_req, res) => {
  const checks = await Promise.all([
    prisma
      .$queryRaw`SELECT 1`
      .then(() => ({ postgres: true }))
      .catch(() => ({ postgres: false })),
    isRedisHealthy().then((ok) => ({ redis: ok })),
  ])

  const postgres = checks[0].postgres
  const redis = checks[1].redis
  const ready = postgres && redis

  res.status(ready ? 200 : 503).json({
    status: ready ? 'ready' : 'degraded',
    checks: { postgres, redis },
    timestamp: new Date().toISOString(),
  })
})

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// ─── Routes ───
app.use('/api/v1/auth', authLimiter, authRoutes)
app.use('/api/v1/me', globalLimiter, meRoutes)
app.use('/api/v1/notebooks', globalLimiter, notebookRoutes)
app.use('/api/v1/internal/upload', uploadRouter)
app.use('/api/v1', globalLimiter, sourceRoutes) // /notebooks/:id/sources/* and /sources/*
app.use('/api/v1', chatRoutes) // chat limiter applied per-route (per-user)

// ─── 404 + errors ───
app.use((req, res) => {
  res.status(404).json({
    data: null,
    meta: { requestId: req.requestId ?? 'req_unknown' },
    error: { code: 'NOT_FOUND', message: 'Endpoint not found', retryable: false },
  })
})

app.use(errorHandler)

// ─── Boot + graceful shutdown (spec §88) ───
const server = app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`)
  warmCacheConnection()
})

let shuttingDown = false
const shutdown = async (signal: string) => {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`Received ${signal}. Shutting down gracefully...`)

  const forceExit = setTimeout(() => process.exit(1), 30_000)
  forceExit.unref()

  // 1. stop accepting new requests; 2. let active requests finish
  server.close(async () => {
    await closeQueues()
    await disconnectRedis()
    await prisma.$disconnect()
    console.log('Shutdown complete')
    process.exit(0)
  })
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason)
})

export { app, cacheRedis }
