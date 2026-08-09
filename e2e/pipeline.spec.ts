import { test, expect } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * End-to-end verification of Phase 8, Milestone 8.1's chained-context
 * pipeline: the four LLM steps (data dictionary -> business insights ->
 * explanation -> client questions) run automatically as soon as a dataset
 * goes active, with no manual "Generate" trigger anywhere in the UI; a
 * dataset whose pipeline already finished shows its content immediately on
 * reload with no re-run; and the single "Re-run analysis" sidebar affordance
 * (replacing the old per-panel "Regenerate" buttons) genuinely re-invokes
 * the pipeline from scratch.
 *
 * Hits real Mistral/Gemini APIs, so this uses generous timeouts (matching
 * `data-dictionary-persistence.spec.ts`'s convention).
 *
 * Phase 8, Milestone 8.2 update: the whole chain now runs behind a
 * full-viewport loading overlay that locks the shell (including sidebar
 * navigation), so this test waits for the overlay to disappear rather than
 * clicking into sections mid-run to detect progress — by the time the shell
 * is reachable again, the entire chain (not just one step) has finished.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATASET_A = path.resolve(__dirname, '../docs/lakeside_orders_sample.csv')

test('pipeline runs automatically, resumes correctly on reload, and Re-run analysis re-triggers real calls', async ({
  page,
}) => {
  test.setTimeout(300_000)

  const llmRequests: string[] = []
  page.on('request', (request) => {
    const url = request.url()
    if (
      url.includes('api.mistral.ai') ||
      url.includes('generativelanguage.googleapis.com')
    ) {
      llmRequests.push(url)
    }
  })

  await page.goto('/')
  await page.evaluate(() => indexedDB.deleteDatabase('keyrus-dataset-analyzer'))
  await page.reload()

  const overlay = page.getByRole('status', { name: 'Loading overlay' })

  await page.locator('input[type="file"]').setInputFiles(DATASET_A)
  await expect(
    page.getByRole('heading', { name: 'Dataset overview' }),
  ).toBeVisible({ timeout: 15_000 })

  // No manual "Generate ..." trigger should exist anywhere — the pipeline
  // is the only thing that ever starts an LLM call now.
  await expect(page.getByRole('button', { name: /^Generate/ })).toHaveCount(0)

  // Wait for the whole chain to finish — locked behind the full-viewport
  // loading overlay (Phase 8, Milestone 8.2), so its disappearance is the
  // signal all four steps are done, not any one panel's own spinner.
  await expect(overlay).toBeHidden({ timeout: 180_000 })
  await expect(page.getByRole('button', { name: /^Generate/ })).toHaveCount(0)

  const questionsPanel = page.locator('section[aria-label="Client questions"]')
  await page.getByRole('button', { name: 'Questions', exact: true }).click()
  await expect(questionsPanel.locator('li').first()).toBeVisible()

  // All four steps' content is populated and visible without ever clicking
  // a trigger button.
  await page.getByRole('button', { name: 'Data Dictionary', exact: true }).click()
  await expect(page.getByText('Generating insights...')).toHaveCount(0)
  const dictionaryPanel = page.locator('section', {
    has: page.getByRole('heading', { name: 'Data dictionary' }),
  })
  await expect(dictionaryPanel.locator('article').first()).toBeVisible()

  await page.getByRole('button', { name: 'Business Insights', exact: true }).click()
  await expect(page.getByText('Generating business insights...')).toHaveCount(0)
  await expect(
    page.getByRole('heading', { name: 'Business insights' }),
  ).toBeVisible()

  const requestsAfterFirstRun = llmRequests.length
  // 1 dictionary + 3 business-insights (kpi/insight/recommendation) + 1
  // explanation + 1 client-questions = 6 real calls for a fully-fresh run.
  expect(requestsAfterFirstRun).toBeGreaterThanOrEqual(6)

  // --- Reload: an already-fully-done dataset shows its content immediately, no re-run. ---
  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'Dataset overview' }),
  ).toBeVisible({ timeout: 15_000 })
  // Nothing left to resume, so the overlay (up briefly only for the initial
  // IndexedDB-hydration check) should clear fast.
  await expect(overlay).toBeHidden({ timeout: 5_000 })
  await page.getByRole('button', { name: 'Data Dictionary', exact: true }).click()
  await expect(page.getByText('Generating insights...')).toHaveCount(0)
  await expect(dictionaryPanel.locator('article').first()).toBeVisible()
  // Give any accidental background resume a moment to fire before asserting none did.
  await page.waitForTimeout(3000)
  expect(llmRequests.length).toBe(requestsAfterFirstRun)

  // --- "Re-run analysis" genuinely re-triggers the pipeline from scratch. ---
  await page.getByRole('button', { name: 'Re-run analysis' }).click()
  await expect(overlay).toBeVisible()
  await expect(overlay).toBeHidden({ timeout: 180_000 })
  expect(llmRequests.length).toBeGreaterThan(requestsAfterFirstRun)
})
