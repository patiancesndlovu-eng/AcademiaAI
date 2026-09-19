/**
 * Vitest runs without a real environment; stub the required env vars before
 * any module imports src/config/env (which validates them at import time).
 */
process.env.DATABASE_URL ??= 'postgresql://stub:stub@localhost:5432/stub'
process.env.CLERK_SECRET_KEY ??= 'sk_test_stub'
process.env.CLERK_PUBLISHABLE_KEY ??= 'pk_test_stub'
process.env.GEMINI_API_KEY ??= 'stub-key'
process.env.REDIS_URL ??= 'redis://localhost:6399' // unused port — cache helpers must fail open
process.env.NODE_ENV = 'test'
process.env.UPLOAD_DIR ??= './uploads-test'
