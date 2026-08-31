import { env } from '../config/env'
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs'
import { dirname, join, normalize, resolve } from 'path'
import { randomUUID } from 'crypto'

const UPLOAD_ROOT = resolve(env.UPLOAD_DIR)

export function sanitizeFilename(name: string): string {
  // Remove path traversal attempts and unsafe chars
  const base = name.replace(/[<>:"|?*/\\]/g, '_').replace(/\.{2,}/g, '_')
  const uuid = randomUUID().slice(0, 8)
  const ext = base.split('.').pop() || 'bin'
  const safeBase = base.slice(0, 100).replace(/\.[^.]*$/, '')
  return `${safeBase}_${uuid}.${ext}`
}

export function generatePath(notebookId: string, filename: string): string {
  const dir = join(UPLOAD_ROOT, notebookId)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return join(dir, filename)
}

export function fileExists(filePath: string): boolean {
  const resolved = resolve(UPLOAD_ROOT, normalize(filePath))
  const normalizedRoot = normalize(UPLOAD_ROOT)
  // Path traversal guard: ensure resolved path is inside UPLOAD_ROOT (case-insensitive on Windows)
  if (!resolve(resolved).toLowerCase().startsWith(normalizedRoot.toLowerCase())) {
    return false
  }
  return existsSync(resolved)
}

export function deleteFile(filePath: string): void {
  const resolved = resolve(UPLOAD_ROOT, normalize(filePath))
  const normalizedRoot = normalize(UPLOAD_ROOT)
  if (!resolve(resolved).toLowerCase().startsWith(normalizedRoot.toLowerCase())) {
    throw new Error('Invalid file path')
  }
  if (existsSync(resolved)) {
    unlinkSync(resolved)
  }
}

export function saveFile(filePath: string, buffer: Buffer): void {
  const resolved = resolve(UPLOAD_ROOT, normalize(filePath))
  const normalizedRoot = normalize(UPLOAD_ROOT)
  if (!resolve(resolved).toLowerCase().startsWith(normalizedRoot.toLowerCase())) {
    throw new Error('Invalid file path')
  }
  const dir = dirname(resolved)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  writeFileSync(resolved, buffer)
}