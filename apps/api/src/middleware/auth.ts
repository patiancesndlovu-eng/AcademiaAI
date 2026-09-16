import { Request, Response, NextFunction } from 'express'
import { getAuth, clerkClient } from '@clerk/express'
import { prisma } from '../config/db'
import { logger } from '../utils/logger'
import { serviceUnavailable, unauthorized } from '../utils/errors'

const log = logger.child({ component: 'auth' })

/**
 * Authentication (spec §83): identity is always derived from the verified
 * Clerk session token — never from client-supplied ids, emails or roles.
 *
 * We intentionally use clerkMiddleware() globally + getAuth() per request
 * instead of Clerk's requireAuth() (which 302-redirects; wrong for an API).
 */
export function requireApiAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const auth = getAuth(req)
    if (!auth.isAuthenticated || !auth.userId) {
      return next(unauthorized())
    }
    next()
  } catch {
    return next(unauthorized('Invalid authentication session'))
  }
}

/**
 * Short-lived in-process cache for Clerk profile lookups. The Clerk Backend
 * API call per request was the dominant latency source (30s hangs under
 * degradation), so profiles are cached for 60s and served stale if Clerk
 * is briefly unavailable.
 */
const PROFILE_TTL_MS = 60_000
const profileCache = new Map<string, { email: string; displayName: string | null; avatarUrl: string | null; expiresAt: number }>()

interface ClerkProfile {
  email: string
  displayName: string | null
  avatarUrl: string | null
}

async function fetchClerkProfile(clerkUserId: string): Promise<ClerkProfile> {
  const cached = profileCache.get(clerkUserId)
  if (cached && cached.expiresAt > Date.now()) {
    return cached
  }

  const clerkUser = await clerkClient.users.getUser(clerkUserId)
  const primaryEmail =
    clerkUser.emailAddresses.find((e) => e.id === clerkUser.primaryEmailAddressId)?.emailAddress ??
    clerkUser.emailAddresses[0]?.emailAddress ??
    ''

  const profile: ClerkProfile = {
    email: primaryEmail,
    displayName: clerkUser.firstName || clerkUser.username || null,
    avatarUrl: clerkUser.imageUrl || null,
  }

  profileCache.set(clerkUserId, { ...profile, expiresAt: Date.now() + PROFILE_TTL_MS })
  return profile
}

/**
 * Synchronizes the authenticated Clerk user into PostgreSQL and populates
 * req.user. Runs after requireApiAuth on every authenticated route.
 */
export async function syncUserToDb(req: Request, _res: Response, next: NextFunction) {
  try {
    const auth = getAuth(req)
    if (!auth.isAuthenticated || !auth.userId) {
      return next(unauthorized())
    }

    let profile: ClerkProfile
    try {
      profile = await fetchClerkProfile(auth.userId)
    } catch (err) {
      const stale = profileCache.get(auth.userId)
      if (stale) {
        log.warn({ clerkId: auth.userId }, 'Clerk profile fetch failed, using cached profile')
        profile = { email: stale.email, displayName: stale.displayName, avatarUrl: stale.avatarUrl }
      } else {
        log.error({ err: (err as Error).message }, 'Clerk profile fetch failed with no cache')
        return next(serviceUnavailable('Authentication provider unavailable'))
      }
    }

    if (!profile.email) {
      return next(unauthorized('Account has no email address'))
    }

    const user = await prisma.user.upsert({
      where: { clerkId: auth.userId },
      update: {
        email: profile.email,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
        updatedAt: new Date(),
      },
      create: {
        clerkId: auth.userId,
        email: profile.email,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
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
    log.error({ err: (err as Error).message }, 'User sync failed')
    next(serviceUnavailable('Failed to sync user session'))
  }
}
