import { Request, Response, NextFunction } from 'express'
import { prisma } from '../config/db'
import { forbidden, notFound, unauthorized } from '../utils/errors'

export type NotebookRole = 'owner' | 'editor' | 'viewer'

export const ROLE_RANK: Record<NotebookRole, number> = { viewer: 1, editor: 2, owner: 3 }

/**
 * Notebook-scoped authorization (spec §9/§10/§11).
 *
 * Authentication (Clerk) proves who the caller is; this middleware resolves
 * the caller's role for the notebook and enforces the minimum role for the
 * operation. Public notebooks are readable by any authenticated user
 * (read-only, spec §67). Non-members receive 404 so private notebooks are not
 * revealed to exist; members with an insufficient role receive 403.
 */
export function requireNotebookRole(minimum: NotebookRole) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return next(unauthorized())
      }

      const notebookId = req.params.id ?? req.params.notebookId
      if (!notebookId) {
        return next(notFound('Notebook not found'))
      }

      const notebook = await prisma.notebook.findFirst({
        where: { id: notebookId, deletedAt: null },
        select: { id: true, ownerId: true, visibility: true, members: { where: { userId: req.user.id }, select: { role: true, expiresAt: true } } },
      })

      if (!notebook) {
        return next(notFound('Notebook not found'))
      }

      let role: NotebookRole | null = null
      if (notebook.ownerId === req.user.id) {
        role = 'owner'
      } else {
        const membership = notebook.members[0]
        const unexpired = membership && (!membership.expiresAt || membership.expiresAt > new Date())
        if (unexpired) {
          role = membership.role as NotebookRole
        } else if (notebook.visibility === 'public') {
          role = 'viewer'
        }
      }

      if (!role) {
        return next(notFound('Notebook not found'))
      }

      if (ROLE_RANK[role] < ROLE_RANK[minimum]) {
        return next(forbidden('Insufficient permissions for this operation'))
      }

      req.notebook = { id: notebook.id, ownerId: notebook.ownerId, visibility: notebook.visibility }
      req.role = role
      next()
    } catch (err) {
      next(err)
    }
  }
}
