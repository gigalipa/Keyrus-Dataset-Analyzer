import { test, expect } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * End-to-end verification of Phase 9, Milestone 9.4: the Questions section's
 * filterable/sortable card rework. Confirms cards render with a visible
 * importance indicator (defaulted when the LLM omits `priority`) and topic
 * tags, that the multi-select tag filter (AND semantics — see
 * `ClientQuestionsPanel.tsx`'s doc comment for why) and the importance sort
 * control actually change the visible set/order, and that an empty state
 * appears for a filter combination matching nothing.
 *
 * Hits real Mistral/Gemini APIs for the pipeline, so this uses a generous
 * `test.setTimeout` matching `pipeline.spec.ts`/`top-bar-kpis.spec.ts`.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATASET_A = path.resolve(__dirname, '../docs/lakeside_orders_sample.csv')

test('Questions section renders filterable/sortable cards with importance indicators', async ({
  page,
}) => {
  test.setTimeout(300_000)

  await page.goto('/')
  await page.evaluate(() => indexedDB.deleteDatabase('keyrus-dataset-analyzer'))
  await page.reload()

  await page.locator('input[type="file"]').setInputFiles(DATASET_A)
  await expect(
    page.getByRole('heading', { name: 'Dashboard' }),
  ).toBeVisible({ timeout: 15_000 })

  await expect(page.getByRole('status', { name: 'Loading overlay' })).toBeHidden({
    timeout: 200_000,
  })

  await page.getByRole('button', { name: 'Questions', exact: true }).click()
  const panel = page.locator('section[aria-label="Client questions"]')
  await expect(panel.getByRole('heading', { name: 'Client Questions' })).toBeVisible()

  const cards = panel.locator('li')
  await expect(cards.first()).toBeVisible()
  const cardCount = await cards.count()
  expect(cardCount).toBeGreaterThanOrEqual(2)

  // Every rendered card shows a non-empty importance badge (one of the three
  // known levels) — proof the defensive fallback in `clientQuestions.ts`
  // (defaulting missing `priority` to 'medium') is working end to end, not
  // just leaving some cards blank.
  const importanceLevels = ['HIGH', 'MEDIUM', 'LOW']
  for (let i = 0; i < cardCount; i++) {
    const cardText = await cards.nth(i).innerText()
    expect(importanceLevels.some((level) => cardText.includes(level))).toBe(true)
  }

  // Topic filter chips are present, derived from the actual items (not
  // hardcoded).
  const filterGroup = panel.getByRole('group', { name: /Filter by topic/ })
  await expect(filterGroup).toBeVisible()
  const chips = filterGroup.getByRole('button')
  const chipCount = await chips.count()
  expect(chipCount).toBeGreaterThan(0)

  // --- Multi-select tag filter narrows the visible set. ---
  await chips.nth(0).click()
  await expect(chips.nth(0)).toHaveAttribute('aria-pressed', 'true')
  const countAfterOneFilter = await panel.locator('li').count()
  expect(countAfterOneFilter).toBeLessThanOrEqual(cardCount)
  expect(countAfterOneFilter).toBeGreaterThan(0)

  // --- Empty state: the prompt tags every question with exactly one topic,
  // so the panel's filter uses AND semantics — selecting a second, distinct
  // topic alongside the first guarantees zero items satisfy "has every
  // selected tag" (no item has two topic tags), deterministically reaching
  // the "no items match" empty state described in the checklist.
  if (chipCount > 1) {
    await chips.nth(1).click()
    await expect(chips.nth(1)).toHaveAttribute('aria-pressed', 'true')
    await expect(panel.getByText('No questions match this filter.')).toBeVisible()
    await expect(panel.locator('li')).toHaveCount(0)

    // Deselecting the second chip returns to the single-topic filtered set.
    await chips.nth(1).click()
    await expect(panel.locator('li')).toHaveCount(countAfterOneFilter)
  }

  // Clear the filter back to the full set via the "Clear filter" control.
  await panel.getByRole('button', { name: 'Clear filter' }).click()
  await expect(panel.locator('li')).toHaveCount(cardCount)

  // --- Importance sort: switching to "Importance (high to low)" actually ---
  // --- reorders the visible cards so the badges are non-increasing. ---
  const sortSelect = panel.getByLabel('Sort')
  await sortSelect.selectOption('importance')
  const rank: Record<string, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 }
  const sortedTexts = await panel.locator('li').allInnerTexts()
  const sortedRanks = sortedTexts.map((text) => {
    const found = importanceLevels.find((level) => text.includes(level))
    return found ? rank[found] : 0
  })
  for (let i = 1; i < sortedRanks.length; i++) {
    expect(sortedRanks[i]).toBeLessThanOrEqual(sortedRanks[i - 1])
  }
})
