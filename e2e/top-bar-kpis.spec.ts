import { test, expect } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * End-to-end verification of Phase 8, Milestone 8.3: the top bar's
 * reserved KPI-card region (structural placeholder since Milestone 7.1)
 * renders real business KPI cards from the `businessInsights` slot once the
 * automated pipeline finishes, and swaps to a different dataset's own KPIs
 * when switching datasets via History — never showing the first dataset's
 * cards for the second.
 *
 * Hits real Mistral/Gemini APIs for the pipeline steps, so this uses
 * generous timeouts matching `pipeline.spec.ts`'s convention.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATASET_A = path.resolve(__dirname, '../docs/lakeside_orders_sample.csv')
const DATASET_B = path.resolve(__dirname, './fixtures/dataset-b.csv')

test('top bar renders real KPI cards once the pipeline finishes, and swaps them when switching datasets', async ({
  page,
}) => {
  test.setTimeout(300_000)

  await page.goto('/')
  await page.evaluate(() => indexedDB.deleteDatabase('keyrus-dataset-analyzer'))
  await page.reload()

  const overlay = page.getByRole('status', { name: 'Loading overlay' })
  const kpiRegion = page.getByRole('region', { name: 'Key business indicators' })
  const kpiHint = page.getByText('KPIs will appear here once your data is analyzed.')
  const kpiCard = (region: typeof kpiRegion) => region.locator('dt')

  // 1. Upload dataset A and wait for the whole chain (including
  // businessInsights) to finish behind the loading overlay.
  await page.locator('input[type="file"]').setInputFiles(DATASET_A)
  await expect(
    page.getByRole('heading', { name: 'Dataset overview' }),
  ).toBeVisible({ timeout: 15_000 })
  await expect(overlay).toBeHidden({ timeout: 180_000 })

  // 2. The placeholder hint is gone, replaced by 2-5 real KPI cards (titles
  // in <dt>, non-empty content — not placeholder text).
  await expect(kpiHint).toHaveCount(0)
  const cardTitlesA = await kpiCard(kpiRegion).allTextContents()
  expect(cardTitlesA.length).toBeGreaterThanOrEqual(2)
  expect(cardTitlesA.length).toBeLessThanOrEqual(5)
  for (const title of cardTitlesA) {
    expect(title.trim().length).toBeGreaterThan(0)
  }

  // 3. Switch to a second, different dataset via History's "New dataset".
  await page.getByRole('button', { name: /^History/ }).click()
  const historyDialog = page.getByRole('dialog', { name: 'Dataset history' })
  await expect(historyDialog).toBeVisible()
  await historyDialog.getByRole('button', { name: 'New dataset' }).click()
  await expect(page.getByRole('dialog', { name: /upload/i })).toBeVisible()

  await page.locator('input[type="file"]').setInputFiles(DATASET_B)
  await expect(
    page.getByRole('heading', { name: 'Dataset overview' }),
  ).toBeVisible({ timeout: 15_000 })
  await expect(overlay).toBeHidden({ timeout: 180_000 })

  await expect(kpiHint).toHaveCount(0)
  const cardTitlesB = await kpiCard(kpiRegion).allTextContents()
  expect(cardTitlesB.length).toBeGreaterThanOrEqual(2)
  expect(cardTitlesB.length).toBeLessThanOrEqual(5)

  // 4. Switch back to dataset A via History and confirm its own KPI cards
  // reappear (not B's) — proof the region re-derives from `view`/props per
  // active dataset rather than caching the first render.
  await page.getByRole('button', { name: /^History/ }).click()
  await expect(historyDialog).toBeVisible()
  await historyDialog.getByText('lakeside_orders_sample.csv').click()
  await expect(
    page.getByRole('heading', { name: 'Dataset overview' }),
  ).toBeVisible()

  const cardTitlesAAgain = await kpiCard(kpiRegion).allTextContents()
  expect(cardTitlesAAgain).toEqual(cardTitlesA)
  expect(cardTitlesAAgain).not.toEqual(cardTitlesB)
})
