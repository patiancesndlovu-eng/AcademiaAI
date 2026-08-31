import axios from 'axios'
import { env } from '../config/env' // or however you access env vars in Vite

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1'

export const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
})

// Request interceptor: inject Clerk token
api.interceptors.request.use(async (config) => {
  // Access Clerk session token from window or a global store
  // If using @clerk/clerk-react, import from your auth hook/store
  const token = await window.__clerk?.session?.getToken?.()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Response interceptor: normalize envelope
api.interceptors.response.use(
  (response) => {
    // If backend wraps in { data, meta, error }, unwrap it
    if (response.data && 'data' in response.data && 'meta' in response.data) {
      if (response.data.error) {
        return Promise.reject(response.data.error)
      }
      response.data = response.data.data
    }
    return response
  },
  (error) => {
    const err = error.response?.data?.error || {
      code: 'NETWORK_ERROR',
      message: error.message,
      retryable: true,
    }
    return Promise.reject(err)
  }
)

// Typed wrappers
export async function getNotebooks(params?: {
  scope?: string
  sort?: string
  search?: string
  page?: number
  pageSize?: number
}) {
  const { data } = await api.get('/notebooks', { params })
  return data
}

export async function createNotebook(body: { title: string; description?: string; visibility?: string }) {
  const { data } = await api.post('/notebooks', body)
  return data
}

export async function getNotebook(id: string) {
  const { data } = await api.get(`/notebooks/${id}`)
  return data
}

export async function getSources(notebookId: string, params?: { status?: string; search?: string; page?: number; pageSize?: number }) {
  const { data } = await api.get(`/notebooks/${notebookId}/sources`, { params })
  return data
}

export async function addUrlSource(notebookId: string, body: { url: string; title?: string }) {
  const { data } = await api.post(`/notebooks/${notebookId}/sources/url`, body)
  return data
}

export async function addTextSource(notebookId: string, body: { title: string; text: string }) {
  const { data } = await api.post(`/notebooks/${notebookId}/sources/text`, body)
  return data
}

export async function createUploadIntent(notebookId: string, body: { filename: string; contentType: string; size: number }) {
  const { data } = await api.post(`/notebooks/${notebookId}/sources/upload-intent`, body)
  return data
}

export async function completeUpload(notebookId: string, body: { filePath: string; originalName: string }) {
  const { data } = await api.post(`/notebooks/${notebookId}/sources/upload-complete`, body)
  return data
}