import { test, expect } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * End-to-end verification of Phase 6 Milestone 6.2: persist-on-upload,
 * the History panel, dataset switching, delete + auto-collapse-to-empty-
 * state, and the conditional upload modal (including skip-on-reload).
 *
 * Runs as one sequential test (rather than several independent ones) since
 * each step depends on IndexedDB state left behind by the previous one —
 * exactly the same "no dataset in history yet" -> "one dataset" -> "two
 * datasets" -> back down to zero progression a real user would drive.
 *
 * Phase 8, Milestone 8.2 update: each upload's pipeline now runs behind a
 * full-viewport loading overlay that locks the shell, including the
 * History button/panel — so this test waits for the overlay to clear (all
 * four LLM steps done) before ever opening History, hitting real
 * Mistral/Gemini APIs along the way. Generous timeouts throughout, matching
 * `pipeline.spec.ts`'s convention.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATASET_A = path.resolve(__dirname, '../docs/lakeside_orders_sample.csv')
const DATASET_B = path.resolve(__dirname, './fixtures/dataset-b.csv')

test('upload, switch, delete, and reload flow through the History panel and upload modal', async ({
  page,
}) => {
  // Two full pipelines (dataset A then dataset B) run for real behind the
  // loading overlay before History is ever reachable.
  test.setTimeout(300_000)

  // Start from a clean slate: no stored datasets.
  await page.goto('/')
  await page.evaluate(() => indexedDB.deleteDatabase('keyrus-dataset-analyzer'))
  await page.reload()

  const overlay = page.getByRole('status', { name: 'Loading overlay' })

  // 1. Empty state: the upload modal appears immediately.
  await expect(page.getByRole('dialog', { name: /upload/i })).toBeVisible()

  // 2. Upload dataset A through the modal. The modal itself unmounts the
  // instant the view flips to "active" (same React commit as the upload
  // hook's own "success" state, since persistence is synchronous
  // in-memory before the async IndexedDB write). As of Phase 7 Milestone
  // 7.3, the center viewport (`MainViewport`) shows real per-section
  // content, so "processing complete" is asserted via the default
  // Overview section's real heading.
  await page.locator('input[type="file"]').setInputFiles(DATASET_A)
  await expect(
    page.getByRole('heading', { name: 'Dataset overview' }),
  ).toBeVisible({ timeout: 15_000 })
  // Modal should be gone once results show.
  await expect(page.getByRole('dialog', { name: /upload/i })).toBeHidden()

  // The pipeline auto-starts right after upload and locks the shell
  // (including History) under the loading overlay until all four LLM steps
  // finish (Phase 8, Milestone 8.2).
  await expect(overlay).toBeHidden({ timeout: 180_000 })

  // 3. Open History, use "New dataset" to upload dataset B.
  await page.getByRole('button', { name: /^History/ }).click()
  const historyDialog = page.getByRole('dialog', { name: 'Dataset history' })
  await expect(historyDialog).toBeVisible()
  // Scoped to the History panel's own "New dataset" button — the sidebar's
  // "Upload new dataset" footer button (Milestone 7.2) also matches
  // `getByRole('button', { name: 'New dataset' })` by substring otherwise.
  await historyDialog.getByRole('button', { name: 'New dataset' }).click()
  await expect(page.getByRole('dialog', { name: /upload/i })).toBeVisible()

  await page.locator('input[type="file"]').setInputFiles(DATASET_B)
  await expect(
    page.getByRole('heading', { name: 'Dataset overview' }),
  ).toBeVisible({ timeout: 15_000 })

  // Dataset B's own pipeline must finish (overlay clears) before History
  // is reachable again.
  await expect(overlay).toBeHidden({ timeout: 180_000 })

  // 4. History now lists both datasets.
  await page.getByRole('button', { name: /^History/ }).click()
  await expect(historyDialog).toBeVisible()
  await expect(historyDialog.getByText('lakeside_orders_sample.csv')).toBeVisible()
  await expect(historyDialog.getByText('dataset-b.csv')).toBeVisible()

  // 5. Click dataset A: it must become the active dataset (not B) immediately,
  // with no parse/network delay (hydration is synchronous from IndexedDB).
  // "Which dataset is active" is asserted via the History row's own
  // `aria-current` — set from the same `activeDatasetId` App.tsx derives,
  // independent of `MainViewport`.
  const clickedAt = Date.now()
  await historyDialog.getByText('lakeside_orders_sample.csv').click()
  await expect(
    page.getByRole('heading', { name: 'Dataset overview' }),
  ).toBeVisible()
  const elapsedMs = Date.now() - clickedAt
  expect(elapsedMs).toBeLessThan(2000)

  await page.getByRole('button', { name: /^History/ }).click()
  await expect(historyDialog).toBeVisible()
  await expect(
    historyDialog.getByRole('button', { name: /^lakeside_orders_sample\.csv/ }),
  ).toHaveAttribute('aria-current', 'true')
  await expect(
    historyDialog.getByRole('button', { name: /^dataset-b\.csv/ }),
  ).not.toHaveAttribute('aria-current', 'true')
  await page.keyboard.press('Escape')

  // 6. Delete dataset B (currently viewing A) — history narrows to one,
  // no modal since a dataset remains.
  await page.getByRole('button', { name: /^History/ }).click()
  await expect(historyDialog).toBeVisible()
  await historyDialog.getByRole('button', { name: 'Delete dataset-b.csv' }).click()
  await expect(historyDialog.getByText('dataset-b.csv')).toHaveCount(0)
  await expect(page.getByRole('dialog', { name: /upload/i })).toBeHidden()
  await page.keyboard.press('Escape')

  // 7. Hard reload with exactly one dataset stored: skips the modal,
  // auto-loads it.
  await page.reload()
  await expect(page.getByRole('dialog', { name: /upload/i })).toBeHidden()
  await expect(
    page.getByRole('heading', { name: 'Dataset overview' }),
  ).toBeVisible({ timeout: 15_000 })
  // Nothing left to resume, so the overlay (up briefly only for the initial
  // IndexedDB-hydration check) should already be gone.
  await expect(overlay).toBeHidden({ timeout: 5_000 })

  // 8. Delete the last remaining dataset: History auto-collapses and the
  // upload modal reappears immediately.
  await page.getByRole('button', { name: /^History/ }).click()
  await expect(historyDialog).toBeVisible()
  await historyDialog
    .getByRole('button', { name: 'Delete lakeside_orders_sample.csv' })
    .click()
  await expect(historyDialog).toBeHidden()
  await expect(page.getByRole('dialog', { name: /upload/i })).toBeVisible()
})
