import { test, expect } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * End-to-end verification of Phase 8, Milestone 8.2: the full-viewport
 * loading overlay (`LoadingOverlay`, Phase 7 Milestone 7.3) now covers the
 * entire span beyond-MVP.md describes — "once the user uploads the file,
 * everything locks under a loading overlay with a spinner and a text line ...
 * the text line reflects the current status of the process" — from file
 * selection through every pipeline step finishing, not just the one-time
 * initial IndexedDB-hydration check `App.tsx` used to gate it on.
 *
 * Hits real Mistral/Gemini APIs for the pipeline steps, so this uses
 * generous timeouts matching `pipeline.spec.ts`'s convention.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATASET_A = path.resolve(__dirname, '../docs/lakeside_orders_sample.csv')

test('loading overlay appears immediately on upload, shows changing stage text, and clears once the pipeline finishes', async ({
  page,
}) => {
  test.setTimeout(240_000)

  await page.goto('/')
  await page.evaluate(() => indexedDB.deleteDatabase('keyrus-dataset-analyzer'))
  await page.reload()

  const overlay = page.getByRole('status', { name: 'Loading overlay' })

  await page.locator('input[type="file"]').setInputFiles(DATASET_A)

  // 1. The overlay appears immediately — it covers the parse + Phase 3
  // analysis phase (`uploadState.status === 'processing'`) that runs before
  // the LLM pipeline even starts, not just the pipeline itself.
  await expect(overlay).toBeVisible()

  // 2. Its status text changes over the course of processing — poll and
  // collect distinct strings seen until the pipeline finishes (overlay
  // disappears) or a generous cap is hit. This is the real assertion for
  // "the text line reflects the current status of the process": at least
  // two distinct strings must appear in sequence during one real run.
  // Note: the overlay can flicker briefly hidden between the upload
  // succeeding (`uploadState.status` -> 'success', `view.kind` -> 'active')
  // and the pipeline actually starting (`pipelineRunning` -> true, set only
  // after the dataset finishes its async IndexedDB write) — a real but
  // sub-second gap, not "the pipeline is done". A short hidden-streak
  // debounce avoids mistaking that flicker for completion.
  const seenTexts: string[] = []
  let hiddenStreak = 0
  const pollDeadline = Date.now() + 220_000
  while (Date.now() < pollDeadline) {
    const visible = await overlay.isVisible()
    if (visible) {
      hiddenStreak = 0
      const text = (await overlay.innerText()).trim()
      if (text && seenTexts[seenTexts.length - 1] !== text) {
        seenTexts.push(text)
      }
    } else {
      hiddenStreak += 1
      if (hiddenStreak >= 5) break // ~2s continuously hidden = genuinely done
    }
    await page.waitForTimeout(400)
  }

  // In case the polling loop's own deadline was hit while a slow step was
  // still running, wait out the rest of the pipeline for real.
  await expect(overlay).toBeHidden({ timeout: 220_000 })

  const distinctTexts = new Set(seenTexts)
  expect(distinctTexts.size).toBeGreaterThanOrEqual(2)
  // The mapping is stage-based, not a fixed timer — every string seen must
  // be one of the known stage labels, not arbitrary/garbled text.
  const KNOWN_STATUS_TEXTS = new Set([
    'Understanding data...',
    'Generating KPIs...',
    'Explaining business insights...',
    'Preparing client questions...',
    'Analyzing your data...',
  ])
  for (const text of distinctTexts) {
    expect(KNOWN_STATUS_TEXTS.has(text)).toBe(true)
  }

  // 3. Once the overlay is gone, the dashboard is genuinely interactive.
  await expect(
    page.getByRole('heading', { name: 'Dataset overview' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Data Dictionary', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Data Dictionary', exact: true }),
  ).toHaveAttribute('aria-current', 'page')
})

test('loading overlay locks the shell underneath it during a pipeline run', async ({
  page,
}) => {
  test.setTimeout(300_000)

  await page.goto('/')
  await page.evaluate(() => indexedDB.deleteDatabase('keyrus-dataset-analyzer'))
  await page.reload()

  const overlay = page.getByRole('status', { name: 'Loading overlay' })

  await page.locator('input[type="file"]').setInputFiles(DATASET_A)
  await expect(
    page.getByRole('heading', { name: 'Dataset overview' }),
  ).toBeVisible({ timeout: 15_000 })
  await expect(overlay).toBeHidden({ timeout: 180_000 })

  // Confirm the active section before attempting to disrupt it.
  const overviewNavItem = page.getByRole('button', { name: 'Overview', exact: true })
  await expect(overviewNavItem).toHaveAttribute('aria-current', 'page')
  const dictionaryNavItem = page.getByRole('button', {
    name: 'Data Dictionary',
    exact: true,
  })
  const historyButton = page.getByRole('button', { name: /^History/ })

  // "Re-run analysis" re-triggers the full pipeline, re-locking the shell.
  await page.getByRole('button', { name: 'Re-run analysis' }).click()
  await expect(overlay).toBeVisible()

  // A real click at the "Data Dictionary" nav item's screen coordinates
  // must land on the overlay, not the button underneath it — proof the
  // shell is genuinely inert, not just visually dimmed.
  const dictionaryBox = await dictionaryNavItem.boundingBox()
  expect(dictionaryBox).not.toBeNull()
  const elementAtDictionaryPoint = await page.evaluate(
    ([x, y]) => document.elementFromPoint(x, y)?.getAttribute('role') ?? null,
    [
      dictionaryBox!.x + dictionaryBox!.width / 2,
      dictionaryBox!.y + dictionaryBox!.height / 2,
    ] as [number, number],
  )
  expect(elementAtDictionaryPoint).toBe('status')

  // Same for the History trigger — per the spec, it becomes unreachable
  // mid-pipeline too, not just the sidebar.
  const historyBox = await historyButton.boundingBox()
  expect(historyBox).not.toBeNull()
  const elementAtHistoryPoint = await page.evaluate(
    ([x, y]) => document.elementFromPoint(x, y)?.getAttribute('role') ?? null,
    [historyBox!.x + historyBox!.width / 2, historyBox!.y + historyBox!.height / 2] as [
      number,
      number,
    ],
  )
  expect(elementAtHistoryPoint).toBe('status')

  // A genuine Playwright click (real actionability checks, not `force`)
  // against the obscured nav item must fail to land within a short window.
  let clickError: unknown = null
  try {
    await dictionaryNavItem.click({ timeout: 2_000 })
  } catch (error) {
    clickError = error
  }
  expect(clickError).not.toBeNull()

  // Nothing changed: the active section is still Overview.
  await expect(overviewNavItem).toHaveAttribute('aria-current', 'page')
  await expect(dictionaryNavItem).not.toHaveAttribute('aria-current', 'page')

  // Let the re-run finish so the test ends in a clean state.
  await expect(overlay).toBeHidden({ timeout: 200_000 })
})
