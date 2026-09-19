import { existsSync, mkdirSync } from 'fs'
import { readFile, unlink, writeFile } from 'fs/promises'
import { dirname, join, normalize, resolve } from 'path'
import { randomUUID } from 'crypto'
import { env } from '../config/env'
import { extensionForKind } from '../utils/magicBytes'

const UPLOAD_ROOT = resolve(env.UPLOAD_DIR)

/**
 * Local-disk storage provider (S3/MinIO swap is a later phase). Paths are
 * always generated server-side from ids + a random suffix; client filenames
 * never influence the path (spec §139/§140), and every access re-verifies
 * the path stays inside UPLOAD_ROOT.
 */

export function sanitizeFilename(name: string): string {
  const base = name.replace(/[<>:"|?*/\\]/g, '_').replace(/\.{2,}/g, '_')
  const safeBase = base.slice(0, 100).replace(/\.[^.]*$/, '') || 'file'
  return `${safeBase}_${randomUUID().slice(0, 8)}`
}

export function generatePath(notebookId: string, sanitizedBase: string, kind: keyof typeof extensionForKind | string): string {
  const dir = join(UPLOAD_ROOT, notebookId)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  const ext = extensionForKind(kind as Parameters<typeof extensionForKind>[0]) ?? 'bin'
  return join(dir, `${sanitizedBase}.${ext}`)
}

function resolveInsideRoot(filePath: string): string | null {
  const resolved = resolve(UPLOAD_ROOT, normalize(filePath))
  const rootWithSep = normalize(UPLOAD_ROOT + '\\') // Windows roots use backslashes
  const alt = normalize(UPLOAD_ROOT + '/')
  const ok =
    resolved.toLowerCase() === normalize(UPLOAD_ROOT).toLowerCase() ||
    resolved.toLowerCase().startsWith(rootWithSep.toLowerCase()) ||
    resolved.toLowerCase().startsWith(alt.toLowerCase())
  return ok ? resolved : null
}

export function fileExists(filePath: string): boolean {
  const resolved = resolveInsideRoot(filePath)
  if (!resolved) return false
  return existsSync(resolved)
}

export async function deleteFile(filePath: string): Promise<void> {
  const resolved = resolveInsideRoot(filePath)
  if (!resolved) throw new Error('Invalid file path')
  await unlink(resolved).catch((err: NodeJS.ErrnoException) => {
    if (err.code !== 'ENOENT') throw err
  })
}

export async function saveFile(filePath: string, buffer: Buffer): Promise<void> {
  const resolved = resolveInsideRoot(filePath)
  if (!resolved) throw new Error('Invalid file path')
  const dir = dirname(resolved)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  await writeFile(resolved, buffer)
}

export async function readFileBuffer(filePath: string): Promise<Buffer> {
  const resolved = resolveInsideRoot(filePath)
  if (!resolved) throw new Error('Invalid file path')
  return readFile(resolved)
}

export function uploadRoot(): string {
  return UPLOAD_ROOT
}
