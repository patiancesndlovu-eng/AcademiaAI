import { describe, it, expect, vi, beforeEach } from 'vitest'
import { requireNotebookRole, ROLE_RANK } from '../../src/middleware/authorization'
import type { NotebookRole } from '../../src/middleware/authorization'

// Mock the Prisma layer — authorization logic is what's under test
vi.mock('../../src/config/db', () => ({
  prisma: {
    notebook: {
      findFirst: vi.fn(),
    },
  },
}))

import { prisma } from '../../src/config/db'
const findFirstMock = vi.mocked(prisma.notebook.findFirst)

describe('role hierarchy (spec §10)', () => {
  it('ranks owner > editor > viewer', () => {
    expect(ROLE_RANK.owner).toBeGreaterThan(ROLE_RANK.editor)
    expect(ROLE_RANK.editor).toBeGreaterThan(ROLE_RANK.viewer)
  })

  it('satisfies minimum-role semantics', () => {
    const satisfies = (role: NotebookRole, min: NotebookRole) => ROLE_RANK[role] >= ROLE_RANK[min]
    expect(satisfies('viewer', 'viewer')).toBe(true)
    expect(satisfies('viewer', 'editor')).toBe(false)
    expect(satisfies('editor', 'owner')).toBe(false)
    expect(satisfies('owner', 'editor')).toBe(true)
  })
})

const user = { id: 'user_1', clerkId: 'c1', email: 'e@x.co', displayName: null, avatarUrl: null }

function makeRes() {
  const res = {
    statusCode: undefined as number | undefined,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code
      return res
    },
    json(body: unknown) {
      res.body = body
      return res
    },
  }
  return res
}

async function run(
  minimum: NotebookRole,
  dbResult: { id: string; ownerId: string; visibility: string; members: { role: string; expiresAt: Date | null }[] } | null,
  params: Record<string, string> = { id: 'nb_1' },
  opts: { user?: typeof user | null } = {}
) {
  findFirstMock.mockResolvedValue(dbResult as never)

  const req = { params, user: 'user' in opts ? opts.user : user } as never
  const res = makeRes()
  let nextErr: unknown
  let nextCalled = false

  await requireNotebookRole(minimum)(req, res as never, (err?: unknown) => {
    nextCalled = true
    nextErr = err
  })

  return { req: req as { role?: NotebookRole; notebook?: { id: string } }, res, nextCalled, nextErr }
}

describe('requireNotebookRole middleware', () => {
  beforeEach(() => {
    findFirstMock.mockReset()
  })

  it('attaches notebook + role and calls next for a sufficient role', async () => {
    const { req, nextCalled, nextErr } = await run('editor', {
      id: 'nb_1',
      ownerId: 'user_1',
      visibility: 'private',
      members: [],
    })
    expect(nextCalled).toBe(true)
    expect(nextErr).toBeUndefined()
    expect(req.role).toBe('owner')
    expect(req.notebook?.id).toBe('nb_1')
  })

  it('uses the member row role for non-owners', async () => {
    const { req, nextCalled } = await run('viewer', {
      id: 'nb_1',
      ownerId: 'someone_else',
      visibility: 'private',
      members: [{ role: 'editor', expiresAt: null }],
    })
    expect(nextCalled).toBe(true)
    expect(req.role).toBe('editor')
  })

  it('ignores expired memberships', async () => {
    const { nextErr } = await run('viewer', {
      id: 'nb_1',
      ownerId: 'someone_else',
      visibility: 'private',
      members: [{ role: 'editor', expiresAt: new Date(Date.now() - 1000) }],
    })
    expect((nextErr as { statusCode?: number })?.statusCode).toBe(404)
  })

  it('treats public notebooks as readable (viewer) by non-members', async () => {
    const { req, nextCalled } = await run('viewer', {
      id: 'nb_1',
      ownerId: 'someone_else',
      visibility: 'public',
      members: [],
    })
    expect(nextCalled).toBe(true)
    expect(req.role).toBe('viewer')
  })

  it('returns 404 (no existence leak) for non-member on private notebook', async () => {
    const { nextErr } = await run('viewer', {
      id: 'nb_1',
      ownerId: 'someone_else',
      visibility: 'private',
      members: [],
    })
    expect((nextErr as { statusCode?: number })?.statusCode).toBe(404)
  })

  it('returns 403 when role is below the minimum', async () => {
    const { nextErr } = await run('editor', {
      id: 'nb_1',
      ownerId: 'someone_else',
      visibility: 'public',
      members: [],
    })
    expect((nextErr as { statusCode?: number })?.statusCode).toBe(403)
  })

  it('returns 404 when the notebook does not exist', async () => {
    const { nextErr } = await run('viewer', null)
    expect((nextErr as { statusCode?: number })?.statusCode).toBe(404)
  })

  it('returns 401 when req.user is missing', async () => {
    const { nextErr } = await run('viewer', null, { id: 'nb_1' }, { user: null })
    expect((nextErr as { statusCode?: number })?.statusCode).toBe(401)
  })

  it('handles the :notebookId param variant', async () => {
    const { req, nextCalled } = await run(
      'viewer',
      { id: 'nb_1', ownerId: 'user_1', visibility: 'private', members: [] },
      { notebookId: 'nb_1' }
    )
    expect(nextCalled).toBe(true)
    expect(req.notebook?.id).toBe('nb_1')
  })
})
