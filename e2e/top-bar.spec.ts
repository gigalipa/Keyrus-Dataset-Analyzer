import { test, expect } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * End-to-end verification of Phase 7 Milestone 7.1: the top bar's
 * conditional History button (hidden until a dataset is active, then
 * showing the correct dataset-count badge) and the logo-only-on-mobile
 * behavior below the 640px (`sm`) breakpoint.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATASET_A = path.resolve(__dirname, '../docs/lakeside_orders_sample.csv')

test('History button is gated on an active dataset, badge reflects count, logo-only below sm', async ({
  page,
}) => {
  // Start from a clean slate: no stored datasets.
  await page.goto('/')
  await page.evaluate(() => indexedDB.deleteDatabase('keyrus-dataset-analyzer'))
  await page.reload()

  // 1. Empty state (view.kind === 'upload'): the History button must not
  // be visible yet.
  await expect(page.getByRole('dialog', { name: /upload/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /^History/ })).toHaveCount(0)

  // 2. Upload dataset A. Once processing completes (view.kind === 'active')
  // the History button appears with a badge reading "1". As of Milestone
  // 7.3 the center viewport shows real per-section content (`MainViewport`)
  // rather than a placeholder, so "processing complete" is asserted via the
  // default Dashboard section's real heading.
  await page.locator('input[type="file"]').setInputFiles(DATASET_A)
  await expect(
    page.getByRole('heading', { name: 'Dashboard' }),
  ).toBeVisible({ timeout: 15_000 })

  const historyButton = page.getByRole('button', { name: /^History/ })
  await expect(historyButton).toBeVisible()
  await expect(historyButton).toContainText('1')

  // 3. Logo-only-on-mobile: below the sm breakpoint, the title text is not
  // visible (display:none via Tailwind's `hidden sm:inline`), but the logo
  // image remains visible.
  await page.setViewportSize({ width: 375, height: 700 })
  const logo = page.getByAltText('Keyrus')
  const title = page.getByRole('heading', { name: 'Keyrus Dataset Analyzer' })
  await expect(logo).toBeVisible()
  await expect(title).toBeHidden()

  // 4. Back at desktop width, the title is visible again alongside the logo.
  await page.setViewportSize({ width: 1280, height: 800 })
  await expect(logo).toBeVisible()
  await expect(title).toBeVisible()
})
