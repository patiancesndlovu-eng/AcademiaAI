import { prisma } from '../config/db'

export async function findOrCreateUser(
  clerkId: string,
  data: {
    email: string
    displayName?: string | null
    avatarUrl?: string | null
  }
) {
  return prisma.user.upsert({
    where: { clerkId },
    update: {
      email: data.email,
      displayName: data.displayName ?? null,
      avatarUrl: data.avatarUrl ?? null,
      updatedAt: new Date(),
    },
    create: {
      clerkId,
      email: data.email,
      displayName: data.displayName ?? null,
      avatarUrl: data.avatarUrl ?? null,
    },
  })
}

export async function getUserByClerkId(clerkId: string) {
  return prisma.user.findUnique({ where: { clerkId } })
}

export async function getUserById(id: string) {
  return prisma.user.findUnique({ where: { id } })
}

export async function updateUser(
  id: string,
  data: {
    displayName?: string
    avatarUrl?: string
  }
) {
  return prisma.user.update({
    where: { id },
    data: { ...data, updatedAt: new Date() },
  })
}
