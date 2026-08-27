export interface Notebook { id: string; ownerId: string; title: string; description: string | null; visibility: 'private' | 'shared' | 'public'; sourceCount: number; createdAt: string; updatedAt: string }
export interface Source { id: string; notebookId: string; type: 'upload' | 'url' | 'text' | 'drive'; title: string; status: 'queued' | 'processing' | 'ready' | 'failed'; selected: boolean; wordCount: number | null; createdAt: string }
export interface ChatMessage { id: string; notebookId: string; role: 'user' | 'assistant'; content: string; citations: Citation[]; createdAt: string }
export interface Citation { id: string; sourceId: string; sourceTitle: string; quote: string | null; page: number | null }
export interface ApiResponse<T> { data: T | null; meta: { requestId: string }; error: { code: string; message: string; retryable?: boolean } | null }
