import { Request, Response, NextFunction } from 'express'
import { getAuth, clerkClient } from '@clerk/express'
import { prisma } from '../config/db'

/**
 * Authenticate an API request using Clerk.
 *
 * IMPORTANT:
 * We intentionally do NOT use requireAuth().
 *
 * Clerk recommends using clerkMiddleware() globally and
 * getAuth() for protecting API routes.
 */
export function requireApiAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const auth = getAuth(req)

    if (!auth.isAuthenticated || !auth.userId) {
      return res.status(401).json({
        data: null,
        meta: {
          requestId: req.requestId,
        },
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
          retryable: false,
        },
      })
    }

    next()
  } catch (err) {
    console.error('[AUTH] Authentication check failed:', err)

    return res.status(401).json({
      data: null,
      meta: {
        requestId: req.requestId,
      },
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid authentication session',
        retryable: false,
      },
    })
  }
}

/**
 * Temporary authentication diagnostics.
 *
 * This can remain during development while we verify the
 * authentication pipeline.
 */
export function debugAuth(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  const startedAt = Date.now()

  console.log('\n========== AUTH DEBUG ==========')
  console.log('[AUTH DEBUG] Method:', req.method)
  console.log('[AUTH DEBUG] URL:', req.originalUrl)
  console.log('[AUTH DEBUG] Request ID:', req.requestId)
  console.log(
    '[AUTH DEBUG] Authorization:',
    req.headers.authorization ? 'PRESENT' : 'MISSING'
  )

  try {
    const auth = getAuth(req)

    console.log('[AUTH DEBUG] getAuth() completed')
    console.log(
      '[AUTH DEBUG] isAuthenticated:',
      auth.isAuthenticated
    )
    console.log(
      '[AUTH DEBUG] userId:',
      auth.userId ?? 'NONE'
    )
    console.log(
      '[AUTH DEBUG] sessionId:',
      auth.sessionId ?? 'NONE'
    )
    console.log(
      '[AUTH DEBUG] elapsed:',
      `${Date.now() - startedAt}ms`
    )

    next()
  } catch (err) {
    console.error('[AUTH DEBUG] getAuth() failed:', err)
    next(err)
  }
}

/**
 * Synchronize the authenticated Clerk user into the
 * local PostgreSQL database.
 */
export async function syncUserToDb(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const startedAt = Date.now()

  try {
    console.log('\n========== USER SYNC ==========')
    console.log('[SYNC] Started')
    console.log('[SYNC] Request:', req.method, req.originalUrl)

    const auth = getAuth(req)

    console.log('[SYNC] getAuth() completed')
    console.log('[SYNC] isAuthenticated:', auth.isAuthenticated)
    console.log('[SYNC] Clerk user ID:', auth.userId ?? 'NONE')

    if (!auth.isAuthenticated || !auth.userId) {
      console.log('[SYNC] Authentication missing')

      return res.status(401).json({
        data: null,
        meta: {
          requestId: req.requestId,
        },
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
          retryable: false,
        },
      })
    }

    /*
     * Fetch the user from Clerk.
     */
    console.log('[SYNC] Calling Clerk users.getUser()...')

    const clerkStartedAt = Date.now()

    const clerkUser =
      await clerkClient.users.getUser(auth.userId)

    console.log(
      '[SYNC] Clerk users.getUser() completed:',
      `${Date.now() - clerkStartedAt}ms`
    )

    const primaryEmail =
      clerkUser.emailAddresses.find(
        (email) =>
          email.id === clerkUser.primaryEmailAddressId
      )?.emailAddress ??
      clerkUser.emailAddresses[0]?.emailAddress ??
      ''

    console.log(
      '[SYNC] Primary email:',
      primaryEmail || 'NONE'
    )

    if (!primaryEmail) {
      return res.status(400).json({
        data: null,
        meta: {
          requestId: req.requestId,
        },
        error: {
          code: 'BAD_REQUEST',
          message: 'User has no email address',
          retryable: false,
        },
      })
    }

    /*
     * Synchronize user with PostgreSQL.
     */
    console.log('[SYNC] Calling Prisma user.upsert()...')

    const prismaStartedAt = Date.now()

    const user = await prisma.user.upsert({
      where: {
        clerkId: auth.userId,
      },
      update: {
        email: primaryEmail,
        displayName:
          clerkUser.firstName ||
          clerkUser.username ||
          null,
        avatarUrl:
          clerkUser.imageUrl || null,
        updatedAt: new Date(),
      },
      create: {
        clerkId: auth.userId,
        email: primaryEmail,
        displayName:
          clerkUser.firstName ||
          clerkUser.username ||
          null,
        avatarUrl:
          clerkUser.imageUrl || null,
      },
    })

    console.log(
      '[SYNC] Prisma user.upsert() completed:',
      `${Date.now() - prismaStartedAt}ms`
    )

    console.log('[SYNC] Local user ID:', user.id)

    req.user = {
      id: user.id,
      clerkId: user.clerkId,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
    }

    console.log('[SYNC] req.user populated')
    console.log(
      '[SYNC] Total elapsed:',
      `${Date.now() - startedAt}ms`
    )

    console.log('================================\n')

    next()
  } catch (err) {
    console.error('\n========== USER SYNC ERROR ==========')
    console.error('[SYNC ERROR]', err)

    if (err instanceof Error) {
      console.error('[SYNC ERROR MESSAGE]', err.message)
      console.error('[SYNC ERROR STACK]', err.stack)
    }

    console.error('======================================\n')

    return res.status(500).json({
      data: null,
      meta: {
        requestId: req.requestId,
      },
      error: {
        code: 'AUTH_SYNC_FAILED',
        message: 'Failed to sync user session',
        retryable: true,
      },
    })
  }
}

