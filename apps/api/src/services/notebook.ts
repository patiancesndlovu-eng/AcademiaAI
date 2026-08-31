import { prisma } from '../config/db'

export async function listNotebooks(
  userId: string,
  options: {
    scope?: 'owned' | 'shared' | 'all'
    sort?: 'updated' | 'created'
    search?: string
  }
) {
  const { scope = 'all', sort = 'updated', search } = options

  const where: any = { deletedAt: null }

  if (scope === 'owned') {
    where.ownerId = userId
  } else if (scope === 'shared') {
    where.members = { some: { userId } }
  } else {
    where.OR = [{ ownerId: userId }, { members: { some: { userId } } }]
  }

  if (search) {
    where.title = { contains: search, mode: 'insensitive' }
  }

  const orderBy =
    sort === 'created' ? { createdAt: 'desc' as const } : { updatedAt: 'desc' as const }

  return prisma.notebook.findMany({
    where,
    orderBy,
    include: {
      _count: { select: { sources: true } },
      owner: { select: { id: true, displayName: true, email: true } },
    },
  })
}

export async function createNotebook(
  userId: string,
  data: {
    title: string
    description?: string
    visibility?: string
  }
) {
  return prisma.notebook.create({
    data: {
      title: data.title,
      description: data.description ?? null,
      visibility: data.visibility || 'private',
      ownerId: userId,
      members: {
        create: { userId, role: 'owner' },
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
  data: {
    title?: string
    description?: string
    visibility?: string
  }
) {
  const existing = await prisma.notebook.findFirst({
    where: {
      id,
      deletedAt: null,
      OR: [
        { ownerId: userId },
        { members: { some: { userId, role: { in: ['owner', 'editor'] } } } },
      ],
    },
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
      OR: [
        { ownerId: userId },
        { members: { some: { userId, role: 'owner' } } },
      ],
    },
  })

  if (!existing) return null

  return prisma.notebook.update({
    where: { id },
    data: { deletedAt: new Date(), updatedAt: new Date() },
  })
}

export async function duplicateNotebook(id: string, userId: string) {
  const original = await prisma.notebook.findFirst({
    where: {
      id,
      deletedAt: null,
      OR: [{ ownerId: userId }, { members: { some: { userId } } }],
    },
  })

  if (!original) return null

  return prisma.notebook.create({
    data: {
      title: `${original.title} (Copy)`,
      description: original.description,
      visibility: original.visibility,
      settingsJson: original.settingsJson,
      ownerId: userId,
      members: { create: { userId, role: 'owner' } },
    },
    include: { _count: { select: { sources: true } } },
  })
}

export async function getMembership(notebookId: string, userId: string) {
  const member = await prisma.notebookMember.findUnique({
    where: { notebookId_userId: { notebookId, userId } },
  })

  if (member) return { role: member.role, isMember: true }

  const notebook = await prisma.notebook.findFirst({
    where: { id: notebookId, deletedAt: null, ownerId: userId },
  })

  if (notebook) return { role: 'owner', isMember: true }

  return { role: null, isMember: false }
}