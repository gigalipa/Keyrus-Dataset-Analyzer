import { test, expect } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * End-to-end verification of Phase 9, Milestone 9.2: the Explanation
 * section's display component. Confirms real prose (a title and a
 * non-trivial description) renders once the pipeline's explanation step
 * finishes, and that switching away from and back to the section doesn't
 * flash a stale loading spinner or lose the already-generated content
 * (`ExplanationPanel` owns no local state, so this exercises the plain
 * conditional-render path in `MainViewport`, not `KeptMounted`).
 *
 * Hits real Mistral/Gemini APIs for the pipeline, so this uses a generous
 * `test.setTimeout` matching `pipeline.spec.ts`/`client-questions.spec.ts`.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATASET_A = path.resolve(__dirname, '../docs/lakeside_orders_sample.csv')

test('Explanation section renders real prose and survives a section switch', async ({
  page,
}) => {
  test.setTimeout(300_000)

  await page.goto('/')
  await page.evaluate(() => indexedDB.deleteDatabase('keyrus-dataset-analyzer'))
  await page.reload()

  await page.locator('input[type="file"]').setInputFiles(DATASET_A)
  await expect(
    page.getByRole('heading', { name: 'Dashboard', level: 2 }),
  ).toBeVisible({ timeout: 15_000 })

  await expect(page.getByRole('status', { name: 'Loading overlay' })).toBeHidden({
    timeout: 200_000,
  })

  await page.getByRole('button', { name: 'Explanation', exact: true }).click()
  const panel = page.locator('section', {
    has: page.getByRole('heading', { name: 'Explanation', level: 2 }),
  })
  await expect(panel).toBeVisible()

  // No loading/error state left — the pipeline already finished behind the
  // overlay, and this is not a placeholder.
  await expect(page.getByText('Generating your business explanation...')).toHaveCount(0)
  await expect(page.getByText('coming in Phase 9')).toHaveCount(0)
  await expect(page.getByRole('alert')).toHaveCount(0)

  // Real content: a headline (h3) and a non-trivial prose body.
  const heading = panel.getByRole('heading', { level: 3 })
  await expect(heading).toBeVisible()
  const headingText = (await heading.textContent())?.trim() ?? ''
  expect(headingText.length).toBeGreaterThan(0)

  const bodyText = (await panel.innerText()).trim()
  expect(bodyText.length).toBeGreaterThan(200)

  const contentBefore = await panel.innerText()

  // Switch away, then back — content must still be there, verbatim, with no
  // spinner flash in between.
  await page.getByRole('button', { name: 'Overview', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Dataset overview' })).toBeVisible()
  await page.getByRole('button', { name: 'Explanation', exact: true }).click()
  await expect(panel).toBeVisible()
  await expect(page.getByText('Generating your business explanation...')).toHaveCount(0)

  const contentAfter = await panel.innerText()
  expect(contentAfter).toBe(contentBefore)
})
