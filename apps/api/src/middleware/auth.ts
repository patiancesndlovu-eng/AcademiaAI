import { Request, Response, NextFunction } from 'express'
import { getAuth, requireAuth } from '@clerk/express'
import { clerkClient } from '@clerk/express'
import { prisma } from '../config/db'

export { requireAuth }

export async function syncUserToDb(req: Request, res: Response, next: NextFunction) {
  try {
    const auth = getAuth(req)
    if (!auth?.userId) {
      // requireAuth should have already blocked this, but be safe
      return res.status(401).json({
        data: null,
        meta: { requestId: req.requestId },
        error: { code: 'UNAUTHORIZED', message: 'Authentication required', retryable: false },
      })
    }

    const clerkUser = await clerkClient.users.getUser(auth.userId)
    const primaryEmail =
      clerkUser.emailAddresses.find((e) => e.id === clerkUser.primaryEmailAddressId)
        ?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress ?? ''

    if (!primaryEmail) {
      return res.status(400).json({
        data: null,
        meta: { requestId: req.requestId },
        error: { code: 'BAD_REQUEST', message: 'User has no email address', retryable: false },
      })
    }

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
    return res.status(500).json({
      data: null,
      meta: { requestId: req.requestId },
      error: { code: 'AUTH_SYNC_FAILED', message: 'Failed to sync user session', retryable: true },
    })
  }
}