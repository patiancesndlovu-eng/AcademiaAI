import { Request, Response, NextFunction } from 'express'
import { getAuth, requireAuth } from '@clerk/express'
import { clerkClient } from '@clerk/express'
import { prisma } from '../config/db'

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string
        clerkId: string
        email: string
        displayName: string | null
        avatarUrl: string | null
      }
    }
  }
}

export { requireAuth }

export async function syncUserToDb(req: Request, res: Response, next: NextFunction) {
  try {
    const auth = getAuth(req)
    if (!auth?.userId) {
      return next()
    }

    const clerkUser = await clerkClient.users.getUser(auth.userId)
    const primaryEmail =
      clerkUser.emailAddresses.find((e) => e.id === clerkUser.primaryEmailAddressId)
        ?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress ?? ''

    const user = await prisma.user.upsert({
      where: { clerkId: auth.userId },
      update: {
        email: primaryEmail,
        displayName: clerkUser.firstName || clerkUser.username || null,
        avatarUrl: clerkUser.imageUrl || null,
        updatedAt: new Date(),
      },
      create: {
        clerkId: auth.userId,
        email: primaryEmail,
        displayName: clerkUser.firstName || clerkUser.username || null,
        avatarUrl: clerkUser.imageUrl || null,
      },
    })

    req.user = {
      id: user.id,
      clerkId: user.clerkId,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
    }

    next()
  } catch (err) {
    console.error('User sync error:', err)
    next()
  }
}