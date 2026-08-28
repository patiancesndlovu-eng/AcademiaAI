import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import dotenv from 'dotenv'
import { clerkMiddleware } from '@clerk/express'
import { errorHandler } from './middleware/errorHandler'
import authRoutes from './routes/auth'
import notebookRoutes from './routes/notebooks'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 5000

app.use(helmet())
app.use(cors({ origin: 'http://localhost:5173', credentials: true }))
app.use(morgan('dev'))
app.use(express.json({ limit: '10mb' }))
app.use(clerkMiddleware())

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Phase 1 routes
app.use('/api/v1/me', authRoutes)
app.use('/api/v1/notebooks', notebookRoutes)

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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})