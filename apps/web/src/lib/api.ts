import axios from 'axios'

declare global {
  interface ImportMetaEnv {
    readonly VITE_API_URL: string
  }
  interface ImportMeta {
    readonly env: ImportMetaEnv
  }
}

export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1'

export const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
})

export async function getClerkToken(): Promise<string | null> {
  try {
    const clerk = (window as any).Clerk || (window as any).__clerk
    if (clerk?.session?.getToken) {
      return await clerk.session.getToken()
    }
  } catch {
    // ignore
  }
  return null
}

api.interceptors.request.use(async (config) => {
  const token = await getClerkToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => {
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

export async function updateNotebook(id: string, body: { title?: string; description?: string; visibility?: string }) {
  const { data } = await api.patch(`/notebooks/${id}`, body)
  return data
}

export async function deleteNotebook(id: string) {
  await api.delete(`/notebooks/${id}`)
}

export async function duplicateNotebook(id: string) {
  const { data } = await api.post(`/notebooks/${id}/copy`)
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

export async function batchSelectSources(notebookId: string, body: { sourceIds: string[]; selected: boolean }) {
  const { data } = await api.post(`/notebooks/${notebookId}/sources/select`, body)
  return data
}

export async function getSource(sourceId: string) {
  const { data } = await api.get(`/sources/${sourceId}`)
  return data
}

export async function updateSource(sourceId: string, body: { title?: string; selected?: boolean }) {
  const { data } = await api.patch(`/sources/${sourceId}`, body)
  return data
}

export async function deleteSource(sourceId: string) {
  await api.delete(`/sources/${sourceId}`)
}

export async function retrySource(sourceId: string) {
  const { data } = await api.post(`/sources/${sourceId}/retry`)
  return data
}

export async function getMe() {
  const { data } = await api.get('/me')
  return data
}

export async function updateMe(body: { displayName?: string; avatarUrl?: string }) {
  const { data } = await api.patch('/me', body)
  return data
}

// Chat
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  modelMeta?: any
  createdAt: string
  citations?: { sourceId: string; quote: string | null; page: number | null }[]
}

export interface ChatMessagesResult {
  data: ChatMessage[]
  meta: { nextCursor: string | null; hasMore: boolean }
}

export async function getChatMessages(notebookId: string, params?: { limit?: number; cursor?: string }): Promise<ChatMessagesResult> {
  const { data } = await api.get(`/notebooks/${notebookId}/chat/messages`, { params })
  return data
}

export interface SSEEvent {
  event: string
  data: any
}

export async function* streamChat(
  notebookId: string,
  body: { content: string; sourceIds?: string[]; webEnhanced?: boolean },
  onEvent: (event: SSEEvent) => void
): AsyncGenerator<void> {
  // Retry getting Clerk token up to 3 times with backoff
  let token: string | null = null
  for (let attempt = 0; attempt < 3; attempt++) {
    token = await getClerkToken()
    if (token) break
    await new Promise(r => setTimeout(r, 500 * (attempt + 1)))
  }

  if (!token) {
    throw new Error('Authentication required. Please sign in again.')
  }

  const res = await fetch(`${API_BASE}/notebooks/${notebookId}/chat/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: 'Chat request failed' } }))
    throw new Error(err.error?.message || 'Chat request failed')
  }

  const reader = res.body?.getReader()
  if (!reader) return

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const lines = buffer.split('\n\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.trim()) continue
      const eventMatch = line.match(/^event: (.+)$/m)
      const dataMatch = line.match(/^data: (.+)$/m)
      if (eventMatch && dataMatch) {
        try {
          onEvent({ event: eventMatch[1], data: JSON.parse(dataMatch[1]) })
        } catch {
          // ignore parse errors
        }
      }
    }
  }
}

// Generations
export interface GenerationJob {
  id: string
  notebookId: string
  requestedBy: string
  type: string
  config: any
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled'
  progress: number
  outputId?: string
  error?: string
  createdAt: string
  updatedAt: string
  output?: Output
}

export interface Output {
  id: string
  notebookId: string
  jobId: string
  type: string
  title: string
  content: any
  artifactUrl?: string
  savedState: boolean
  createdAt: string
  updatedAt: string
}

export async function createGeneration(notebookId: string, body: { type: string; config: any }): Promise<{ jobId: string }> {
  const { data } = await api.post(`/notebooks/${notebookId}/generations`, body)
  return data
}

export async function getGenerations(notebookId: string): Promise<GenerationJob[]> {
  const { data } = await api.get(`/notebooks/${notebookId}/generations`)
  return data
}

export async function getGeneration(notebookId: string, jobId: string): Promise<GenerationJob> {
  const { data } = await api.get(`/notebooks/${notebookId}/generations/${jobId}`)
  return data
}

export async function cancelGeneration(notebookId: string, jobId: string) {
  await api.post(`/notebooks/${notebookId}/generations/${jobId}/cancel`)
}

export async function getOutputs(notebookId: string): Promise<Output[]> {
  const { data } = await api.get(`/notebooks/${notebookId}/outputs`)
  return data
}

export async function getOutput(outputId: string): Promise<Output> {
  const { data } = await api.get(`/outputs/${outputId}`)
  return data
}

// Notes
export interface Note {
  id: string
  notebookId: string
  authorId: string
  body: string
  sourceIds: string[]
  outputId?: string
  createdAt: string
  updatedAt: string
  author?: { id: string; displayName?: string; email: string }
}

export async function getNotes(notebookId: string): Promise<Note[]> {
  const { data } = await api.get(`/notebooks/${notebookId}/notes`)
  return data
}

export async function createNote(notebookId: string, body: { body: string; sourceIds?: string[] }): Promise<Note> {
  const { data } = await api.post(`/notebooks/${notebookId}/notes`, body)
  return data
}

export async function updateNote(notebookId: string, noteId: string, body: { body?: string; sourceIds?: string[] }): Promise<Note> {
  const { data } = await api.patch(`/notebooks/${notebookId}/notes/${noteId}`, body)
  return data
}

export async function deleteNote(notebookId: string, noteId: string) {
  await api.delete(`/notebooks/${notebookId}/notes/${noteId}`)
}

// Sharing
export interface NotebookMember {
  id: string
  notebookId: string
  userId: string
  role: 'owner' | 'editor' | 'viewer'
  createdAt: string
  expiresAt?: string
  user?: { id: string; displayName?: string; email: string; avatarUrl?: string }
}

export async function getMembers(notebookId: string): Promise<NotebookMember[]> {
  const { data } = await api.get(`/notebooks/${notebookId}/membership`)
  return data
}

export async function addMember(notebookId: string, body: { email: string; role: 'viewer' | 'editor' | 'owner' }): Promise<NotebookMember> {
  const { data } = await api.post(`/notebooks/${notebookId}/members`, body)
  return data
}

export async function removeMember(notebookId: string, userId: string) {
  await api.delete(`/notebooks/${notebookId}/members/${userId}`)
}

export async function updateMemberRole(notebookId: string, userId: string, role: 'viewer' | 'editor' | 'owner') {
  const { data } = await api.patch(`/notebooks/${notebookId}/members/${userId}`, { role })
  return data
}