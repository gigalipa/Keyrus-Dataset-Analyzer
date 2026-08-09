import { test, expect } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Regression test for a real bug found in live Phase 7 testing: switching
 * from one dataset to another and back re-ran the Data Dictionary's LLM
 * call every time, because `useDatasetSession` builds a brand-new
 * `AnalysisResult` object on every switch and the panel's auto-trigger
 * effect keyed off that object's identity rather than anything durable.
 * The fix persists a freshly-generated dictionary to
 * `PersistedDataset.llmOutputs.dataDictionary` (IndexedDB) and seeds the
 * panel from it on a dataset switch instead of regenerating — this test
 * proves that end to end, across a genuine dataset switch (not just a
 * section switch within one dataset, already covered by
 * `sidebar.spec.ts`).
 *
 * Phase 8, Milestone 8.2 update: each upload's whole pipeline (not just the
 * dictionary step) now runs behind a full-viewport loading overlay that
 * locks the shell, including the History panel used to switch datasets
 * below — so this test waits for the overlay to clear (all four steps done)
 * before touching History, rather than just the dictionary panel's own
 * spinner.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATASET_A = path.resolve(__dirname, '../docs/lakeside_orders_sample.csv')
const DATASET_B = path.resolve(__dirname, './fixtures/dataset-b.csv')

test('Data Dictionary does not regenerate when switching back to a previously-analyzed dataset', async ({
  page,
}) => {
  // Generous overall timeout: this test waits on two full pipelines (each
  // 4 real LLM calls, only one of which is the dictionary itself).
  test.setTimeout(300_000)

  await page.goto('/')
  await page.evaluate(() => indexedDB.deleteDatabase('keyrus-dataset-analyzer'))
  await page.reload()

  const overlay = page.getByRole('status', { name: 'Loading overlay' })

  // 1. Upload dataset A, let its whole pipeline (including the dictionary)
  // finish for real behind the loading overlay, then snapshot the
  // dictionary content.
  await page.locator('input[type="file"]').setInputFiles(DATASET_A)
  await expect(
    page.getByRole('heading', { name: 'Dataset overview' }),
  ).toBeVisible({ timeout: 15_000 })
  await expect(overlay).toBeHidden({ timeout: 180_000 })

  await page.getByRole('button', { name: 'Data Dictionary', exact: true }).click()
  await expect(page.getByText('Generating insights...')).toHaveCount(0)

  const dictionaryPanel = page.locator('section', {
    has: page.getByRole('heading', { name: 'Data dictionary' }),
  })
  const datasetAContent = await dictionaryPanel.innerText()

  // 2. Upload dataset B via "Upload new dataset" — a genuinely different
  // dataset, never analyzed before, so its own pipeline (including its
  // dictionary) is expected to run once. Active section (Data Dictionary)
  // persists across the switch by design, so B's dictionary section is
  // already showing once its pipeline finishes — no need to re-navigate.
  await page.getByRole('button', { name: 'Upload new dataset' }).click()
  await page.locator('input[type="file"]').setInputFiles(DATASET_B)
  await expect(page.getByRole('heading', { name: 'Data dictionary' })).toBeVisible({
    timeout: 15_000,
  })
  await expect(overlay).toBeHidden({ timeout: 180_000 })
  const datasetBContent = await dictionaryPanel.innerText()

  // 3. Switch back to dataset A via History. The dictionary must show up
  // immediately from storage — no "Generating insights..." reappearing —
  // and must be byte-identical to what was generated the first time.
  // Active section stays on Data Dictionary across this switch too. Both
  // datasets' pipelines are fully done at this point, so History (locked
  // under the overlay while a pipeline is in flight) is reachable.
  await page.getByRole('button', { name: 'History' }).click()
  const historyDialog = page.getByRole('dialog', { name: 'Dataset history' })
  await expect(historyDialog).toBeVisible()
  await historyDialog.getByText('lakeside_orders_sample.csv').click()
  await expect(historyDialog).toBeHidden()

  // The key assertion: no regeneration. If this fix regresses, this text
  // reappears and the content below would (most likely) differ from the
  // first snapshot, since a fresh LLM call rarely reproduces byte-identical
  // prose.
  await expect(page.getByText('Generating insights...')).toHaveCount(0)
  const datasetAContentAfterSwitchBack = await dictionaryPanel.innerText()
  expect(datasetAContentAfterSwitchBack).toBe(datasetAContent)
  expect(datasetAContentAfterSwitchBack).not.toBe(datasetBContent)
})
