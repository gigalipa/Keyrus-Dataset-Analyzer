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
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATASET_A = path.resolve(__dirname, '../docs/lakeside_orders_sample.csv')
const DATASET_B = path.resolve(__dirname, './fixtures/dataset-b.csv')

test('upload, switch, delete, and reload flow through the History panel and upload modal', async ({
  page,
}) => {
  // Start from a clean slate: no stored datasets.
  await page.goto('/')
  await page.evaluate(() => indexedDB.deleteDatabase('keyrus-dataset-analyzer'))
  await page.reload()

  // 1. Empty state: the upload modal appears immediately.
  await expect(page.getByRole('dialog', { name: /upload/i })).toBeVisible()

  // 2. Upload dataset A through the modal. The modal itself unmounts the
  // instant the view flips to "active" (same React commit as the upload
  // hook's own "success" state, since persistence is synchronous
  // in-memory before the async IndexedDB write), so the assertion here is
  // on the results view appearing, not on an intermediate status banner.
  await page.locator('input[type="file"]').setInputFiles(DATASET_A)
  await expect(
    page.locator('dd[title="lakeside_orders_sample.csv"]'),
  ).toBeVisible({ timeout: 15_000 })
  // Modal should be gone once results show.
  await expect(page.getByRole('dialog', { name: /upload/i })).toBeHidden()

  // 3. Open History, use "New dataset" to upload dataset B.
  await page.getByRole('button', { name: /^History/ }).click()
  await expect(page.getByRole('dialog', { name: 'Dataset history' })).toBeVisible()
  await page.getByRole('button', { name: 'New dataset' }).click()
  await expect(page.getByRole('dialog', { name: /upload/i })).toBeVisible()

  await page.locator('input[type="file"]').setInputFiles(DATASET_B)
  await expect(
    page.locator('dd[title="dataset-b.csv"]'),
  ).toBeVisible({ timeout: 15_000 })

  // 4. History now lists both datasets.
  await page.getByRole('button', { name: /^History/ }).click()
  const historyDialog = page.getByRole('dialog', { name: 'Dataset history' })
  await expect(historyDialog).toBeVisible()
  await expect(historyDialog.getByText('lakeside_orders_sample.csv')).toBeVisible()
  await expect(historyDialog.getByText('dataset-b.csv')).toBeVisible()

  // 5. Click dataset A: it must render A's data (not B's) immediately,
  // with no parse/network delay (hydration is synchronous from IndexedDB).
  const clickedAt = Date.now()
  await historyDialog.getByText('lakeside_orders_sample.csv').click()
  await expect(page.locator('dd[title="lakeside_orders_sample.csv"]')).toBeVisible()
  const elapsedMs = Date.now() - clickedAt
  expect(elapsedMs).toBeLessThan(2000)
  await expect(page.locator('dd[title="dataset-b.csv"]')).toHaveCount(0)

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
    page.locator('dd[title="lakeside_orders_sample.csv"]'),
  ).toBeVisible({ timeout: 15_000 })

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
