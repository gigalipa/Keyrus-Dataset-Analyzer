import { defineConfig } from 'vitest/config'

/**
 * Vitest config — added in Phase 6, Milestone 6.1 to unit-test the
 * IndexedDB storage layer (`src/lib/storage/`). Nothing else in the repo
 * had a wired-up unit test runner yet (Playwright is present as a
 * devDependency for future e2e work but has no config/tests of its own),
 * and IndexedDB-backed code needs a real IndexedDB implementation to test
 * against meaningfully — `fake-indexeddb` (loaded via each test file's
 * `setupFiles`, or directly via `fake-indexeddb/auto`) provides a
 * spec-compliant, non-mocked implementation that runs in Node, so a full
 * browser isn't required just to exercise this layer.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
