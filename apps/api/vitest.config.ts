import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    // Redis/Prisma clients keep background handles open; unit tests don't need them
    forceExit: true,
  },
})
