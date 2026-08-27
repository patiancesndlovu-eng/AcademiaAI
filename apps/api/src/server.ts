import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import dotenv from 'dotenv'
import { clerkMiddleware } from '@clerk/express'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 5000

app.use(helmet())
app.use(cors({ origin: 'http://localhost:5173', credentials: true }))
app.use(morgan('dev'))
app.use(express.json({ limit: '10mb' }))
app.use(clerkMiddleware())

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.use((err: Error, _req: any, res: any, _next: any) => {
  console.error(err)
  res.status(500).json({ data: null, meta: { requestId: 'req_unknown' }, error: { code: 'INTERNAL_ERROR', message: 'Something went wrong', retryable: true } })
})

app.listen(PORT, () => {
  console.log(Server running on http://localhost:) })
