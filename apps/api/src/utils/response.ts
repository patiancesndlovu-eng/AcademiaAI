import { randomUUID } from 'crypto'

export interface ApiResponse<T> {
  data: T | null
  meta: { requestId: string }
  error: { code: string; message: string; retryable?: boolean } | null
}

export function success<T>(data: T, requestId?: string): ApiResponse<T> {
  return {
    data,
    meta: { requestId: requestId ?? randomUUID() },
    error: null,
  }
}

export function error(
  code: string,
  message: string,
  retryable = false,
  requestId?: string
): ApiResponse<never> {
  return {
    data: null,
    meta: { requestId: requestId ?? randomUUID() },
    error: { code, message, retryable },
  }
}