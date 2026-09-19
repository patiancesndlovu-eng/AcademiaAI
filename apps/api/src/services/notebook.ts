import { NotebookVisibility, NotebookRole, Prisma } from '@prisma/client'
import { prisma } from '../config/db'
import { cacheKeys, cacheTtls } from '../cache/keys'
import { getOrSet } from '../cache/cache'

export interface ListNotebooksOptions {
  scope?: 'owned' | 'shared' | 'all'
  sort?: 'updated' | 'created'
  search?: string
}

export async function listNotebooks(userId: string, options: ListNotebooksOptions) {
  const { scope = 'all', sort = 'updated', search } = options

  const cacheKey = cacheKeys.notebookList(userId, scope, sort, search)

  return getOrSet(cacheKey, cacheTtls.notebookListSec, async () => {
    const where: Prisma.NotebookWhereInput = { deletedAt: null }

    if (scope === 'owned') {
      where.ownerId = userId
    } else if (scope === 'shared') {
      where.members = { some: { userId } }
    } else {
      where.OR = [{ ownerId: userId }, { members: { some: { userId } } }]
    }

    const trimmedSearch = search?.trim().slice(0, 100)
    if (trimmedSearch) {
      where.title = { contains: trimmedSearch, mode: 'insensitive' }
    }

    const orderBy: Prisma.NotebookOrderByWithRelationInput =
      sort === 'created' ? { createdAt: 'desc' } : { updatedAt: 'desc' }

    return prisma.notebook.findMany({
      where,
      orderBy: [orderBy, { id: 'desc' }], // stable secondary key (spec §124)
      include: {
        _count: { select: { sources: true } },
        owner: { select: { id: true, displayName: true, email: true } },
      },
    })
  })
}

export async function createNotebook(
  userId: string,
  data: { title: string; description?: string; visibility?: NotebookVisibility }
) {
  return prisma.notebook.create({
    data: {
      title: data.title,
      description: data.description ?? null,
      visibility: data.visibility ?? NotebookVisibility.private,
      ownerId: userId,
      members: {
        create: { userId, role: NotebookRole.owner },
      },
    },
    include: { _count: { select: { sources: true } } },
  })
}

export async function getNotebook(id: string, userId: string) {
  return prisma.notebook.findFirst({
    where: {
      id,
      deletedAt: null,
      OR: [{ ownerId: userId }, { members: { some: { userId } } }],
    },
    include: {
      _count: { select: { sources: true } },
      owner: { select: { id: true, displayName: true, email: true } },
      members: {
        include: { user: { select: { id: true, displayName: true, email: true } } },
      },
    },
  })
}

export async function updateNotebook(
  id: string,
  userId: string,
  data: { title?: string; description?: string; visibility?: NotebookVisibility }
) {
  const existing = await prisma.notebook.findFirst({
    where: {
      id,
      deletedAt: null,
      OR: [{ ownerId: userId }, { members: { some: { userId, role: { in: ['owner', 'editor'] } } } }],
    },
    select: { id: true },
  })
  if (!existing) return null

  return prisma.notebook.update({
    where: { id },
    data: { ...data, updatedAt: new Date() },
    include: { _count: { select: { sources: true } } },
  })
}

export async function softDeleteNotebook(id: string, userId: string) {
  const existing = await prisma.notebook.findFirst({
    where: {
      id,
      deletedAt: null,
      OR: [{ ownerId: userId }, { members: { some: { userId, role: 'owner' } } }],
    },
    select: { id: true, ownerId: true },
  })
  if (!existing) return null

  return prisma.notebook.update({
    where: { id },
    data: { deletedAt: new Date(), updatedAt: new Date() },
  })
}

/**
 * Notebook copy (spec §74). Metadata, notes and selection settings are
 * duplicated transactionally; source files are NOT duplicated — copied
 * sources are re-enqueued for ingestion from their origin (url/text) and
 * file-based sources are marked failed-pending-copy (storage copy is a
 * later-phase concern). Runs in a bounded transaction.
 */
export async function duplicateNotebook(id: string, userId: string) {
  const original = await prisma.notebook.findFirst({
    where: {
      id,
      deletedAt: null,
      OR: [{ ownerId: userId }, { members: { some: { userId } } }],
    },
    include: {
      sources: { where: { deletedAt: null }, select: { type: true, title: true, canonicalUrl: true, domain: true, extractedText: true, selected: true } },
      notes: { select: { body: true, authorId: true, sourceIds: true } },
    },
  })
  if (!original) return null

  return prisma.$transaction(async (tx) => {
    const copy = await tx.notebook.create({
      data: {
        title: `${original.title} (Copy)`.slice(0, 200),
        description: original.description,
        visibility: NotebookVisibility.private, // copies always start private
        settingsJson: (original.settingsJson ?? {}) as Prisma.InputJsonValue,
        ownerId: userId,
        members: { create: { userId, role: NotebookRole.owner } },
      },
    })

    for (const source of original.sources.slice(0, 100)) {
      await tx.source.create({
        data: {
          notebookId: copy.id,
          type: source.type,
          title: source.title,
          canonicalUrl: source.canonicalUrl,
          domain: source.domain,
          extractedText: source.extractedText,
          selected: source.selected,
          // url/text sources re-process; file-backed sources require the file, so they fail cleanly
          status: source.type === 'upload' ? 'failed' : source.extractedText ? 'queued' : 'queued',
          processingError: source.type === 'upload' ? 'COPY_FILE_NOT_TRANSFERRED' : null,
        },
      })
    }

    for (const note of original.notes.slice(0, 100)) {
      await tx.note.create({
        data: { notebookId: copy.id, authorId: userId, body: note.body, sourceIds: note.sourceIds },
      })
    }

    return tx.notebook.findUniqueOrThrow({
      where: { id: copy.id },
      include: { _count: { select: { sources: true } } },
    })
  })
}

export async function getMembership(notebookId: string, userId: string) {
  // Cache membership briefly (spec §46) — invalidation is aggressive
  return getOrSet(cacheKeys.notebookMembers(notebookId) + `:${userId}`, cacheTtls.membershipSec, async () => {
    const member = await prisma.notebookMember.findUnique({
      where: { notebookId_userId: { notebookId, userId } },
    })

    if (member && (!member.expiresAt || member.expiresAt > new Date())) {
      return { role: member.role, isMember: true }
    }

    const notebook = await prisma.notebook.findFirst({
      where: { id: notebookId, deletedAt: null, ownerId: userId },
      select: { id: true },
    })

    if (notebook) return { role: 'owner', isMember: true }

    return { role: null, isMember: false }
  })
}
