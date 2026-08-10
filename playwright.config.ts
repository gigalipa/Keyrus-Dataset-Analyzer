import { defineConfig, devices } from '@playwright/test'

/**
 * Minimal Playwright config — added in Phase 6, Milestone 6.2 for real
 * end-to-end browser verification of the History panel / upload modal /
 * dataset-switching flow (per NOTES.md: no headless-browser tooling was
 * available during Phase 1, so verification fell back to a manual `npm run
 * dev` walkthrough there; Playwright browsers are installed on this machine
 * now, so this milestone uses the real thing instead).
 *
 * `webServer` boots the Vite dev server itself so `npx playwright test` is
 * a single self-contained command — no separately-running dev server
 * required.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Phase 11, Milestone 11.2: real Chrome/Edge/Safari installs aren't
    // available for automated testing in this environment, so these two use
    // Playwright's other browser *engines* as the closest available proxy —
    // Chromium (above) covers Chrome and Edge (both Chromium-based),
    // Firefox covers Firefox directly, and WebKit is the closest available
    // proxy for Safari (not literal Safari). See NOTES.md for the caveat.
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
})
