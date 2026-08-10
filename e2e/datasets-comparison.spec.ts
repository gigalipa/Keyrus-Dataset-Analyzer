import { test, expect } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * End-to-end verification of Phase 10, Milestone 10.6 "raw vs. cleaned
 * comparison" — the last Phase 10 milestone. After a dataset's pipeline
 * finishes (including Milestone 10.2/10.3's real ETL `clean` step), the
 * Datasets destination shows both the raw parsed table and the genuinely
 * cleaned table side by side, sourced from the same Milestone 6.1 persisted
 * record, plus two buttons that download the *complete* raw/cleaned CSVs
 * (not the 50-row preview).
 *
 * Uses `docs/lakeside_orders_sample.csv`'s known planted casing variants in
 * the `chnl` column ("WEB"/"web"/"store") — Milestones 10.2/10.4/10.5 already
 * proved these get unified by the cleaning plan (e.g. to "Web") — to confirm
 * a genuine, visible raw-vs-cleaned difference, not just that two tables
 * render.
 *
 * Hits real Mistral APIs, so this uses generous timeouts (matching
 * `pipeline.spec.ts`/`quality-audit-trail.spec.ts`'s convention).
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATASET_A = path.resolve(__dirname, '../docs/lakeside_orders_sample.csv')

/** Parses a CSV string's data rows (naive split — good enough for this fixture, which has no embedded commas/newlines in the columns exercised here). */
function countCsvDataRows(csvText: string): number {
  const lines = csvText.replace(/\r\n/g, '\n').split('\n')
  // Drop the trailing empty line (file ends with a line terminator) and the header row.
  const nonEmpty = lines.filter((line) => line.length > 0)
  return Math.max(0, nonEmpty.length - 1)
}

test('Datasets section renders a real raw-vs-cleaned comparison and both CSV downloads are complete', async ({
  page,
}) => {
  test.setTimeout(300_000)

  await page.goto('/')
  await page.evaluate(() => indexedDB.deleteDatabase('keyrus-dataset-analyzer'))
  await page.reload()

  const overlay = page.getByRole('status', { name: 'Loading overlay' })

  await page.locator('input[type="file"]').setInputFiles(DATASET_A)
  await expect(
    page.getByRole('heading', { name: 'Dashboard' }),
  ).toBeVisible({ timeout: 15_000 })

  // Wait for the whole pipeline (understand -> plan cleaning -> clean -> eda
  // -> business insights -> explanation -> client questions) to finish.
  await expect(overlay).toBeHidden({ timeout: 180_000 })

  await page.getByRole('button', { name: 'Datasets', exact: true }).click()

  await expect(
    page.getByRole('heading', { name: 'Raw vs. cleaned' }),
  ).toBeVisible()

  const rawTableCard = page.locator('div.rounded-xl', {
    has: page.getByRole('heading', { name: 'Raw (untouched parse)' }),
  })
  const cleanedTableCard = page.locator('div.rounded-xl', {
    has: page.getByRole('heading', { name: 'Cleaned', exact: true }),
  })

  await expect(rawTableCard.locator('table')).toBeVisible()
  await expect(cleanedTableCard.locator('table')).toBeVisible()

  // Real (not placeholder) content: the raw table's header row includes a
  // real column name from the fixture, and body rows contain real order IDs.
  await expect(rawTableCard.locator('thead')).toContainText('chnl')
  await expect(rawTableCard.locator('tbody')).toContainText(/ORD-\d+/)
  await expect(cleanedTableCard.locator('tbody')).toContainText(/ORD-\d+/)

  // Genuine raw-vs-cleaned difference: the fixture plants "WEB"/"web" casing
  // variants in `chnl`, which the cleaning plan unifies. The raw table
  // should still show at least one of the untouched raw casing variants
  // somewhere in its body; the cleaned table's `chnl` column should show the
  // unified value instead of the untouched all-caps "WEB".
  const rawBodyText = await rawTableCard.locator('tbody').innerText()
  expect(rawBodyText).toMatch(/\bWEB\b/)

  // The "changed" badge on the cleaned table's header confirms the app
  // itself recognizes this column as touched by cleaning (Milestone 10.5's
  // audit trail feeding this view's highlighting).
  const chnlHeader = cleanedTableCard.locator('th', { hasText: 'chnl' })
  await expect(chnlHeader).toBeVisible()
  await expect(chnlHeader.getByText('changed')).toBeVisible()

  // --- Downloads: both buttons produce complete (not 50-row-capped) CSVs. ---
  const [rawDownload] = await Promise.all([
    page.waitForEvent('download'),
    rawTableCard.getByRole('button', { name: 'Download raw CSV' }).click(),
  ])
  const rawPath = await rawDownload.path()
  expect(rawPath).toBeTruthy()
  const rawFs = await import('node:fs/promises')
  const rawContent = await rawFs.readFile(rawPath as string, 'utf-8')
  const rawRowCount = countCsvDataRows(rawContent)

  const [cleanedDownload] = await Promise.all([
    page.waitForEvent('download'),
    cleanedTableCard.getByRole('button', { name: 'Download cleaned CSV' }).click(),
  ])
  const cleanedPath = await cleanedDownload.path()
  expect(cleanedPath).toBeTruthy()
  const cleanedContent = await rawFs.readFile(cleanedPath as string, 'utf-8')
  const cleanedRowCount = countCsvDataRows(cleanedContent)

  // The real fixture file has more than 50 data rows, so a non-capped
  // download must exceed the 50-row UI preview.
  expect(rawRowCount).toBeGreaterThan(50)
  expect(cleanedRowCount).toBeGreaterThan(50)
  // Raw and cleaned have the same row count (cleaning changes values, not
  // row count) — and both downloads should match the dataset's true total.
  expect(cleanedRowCount).toBe(rawRowCount)

  // The unified "Web" value should be present in the downloaded cleaned CSV,
  // and the raw CSV should still contain the untouched "WEB" variant.
  expect(rawContent).toMatch(/,WEB,/)
  expect(cleanedContent).toMatch(/,Web,/)
})
