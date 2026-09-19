declare global {
  namespace Express {
    interface Request {
      /** Populated by syncUserToDb after Clerk authentication. */
      user?: {
        id: string
        clerkId: string
        email: string
        displayName: string | null
        avatarUrl: string | null
      }
      /** Populated by requireNotebookRole after notebook authorization. */
      notebook?: {
        id: string
        ownerId: string
        visibility: string
      }
      /** Resolved membership role of req.user for req.notebook. */
      role?: 'owner' | 'editor' | 'viewer'
    }
  }
}

export {}
