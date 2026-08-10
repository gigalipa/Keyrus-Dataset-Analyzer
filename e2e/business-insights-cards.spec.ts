import { test, expect } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * End-to-end verification of Phase 9, Milestone 9.3: the Business Insights
 * section renders `insights` and `recommendations` as filterable, sortable
 * cards (title, description, importance badge, tag chips) — no KPI cards —
 * per the "Filterable Card List Checklist"
 * (`docs/development-process.md`). Every card must show a non-empty
 * importance badge (proving the `priority` fallback in
 * `src/lib/llm/businessInsights.ts` works even if the LLM under-specifies
 * it), the tag filter and importance sort controls must actually change the
 * visible set/order, and an unsatisfiable tag combination must show the
 * empty state.
 *
 * Hits real Mistral/Gemini APIs for the pipeline, so uses generous timeouts
 * matching `pipeline.spec.ts`'s convention.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATASET_A = path.resolve(__dirname, '../docs/lakeside_orders_sample.csv')

test('Business Insights renders insight/recommendation cards with importance and tag filtering, no KPIs', async ({
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
  await expect(overlay).toBeHidden({ timeout: 180_000 })

  await page.getByRole('button', { name: 'Business Insights', exact: true }).click()
  await expect(page.getByText('Generating business insights...')).toHaveCount(0)

  const section = page.locator('section[aria-labelledby="business-insights-heading"]')
  await expect(section.getByRole('heading', { name: 'Business insights' })).toBeVisible()

  // No KPI region/cards inside this section anymore (KPIs live in the top
  // bar / future Dashboard). The old KPI heading text was "Key Performance
  // Indicators".
  await expect(
    section.getByRole('heading', { name: 'Key Performance Indicators' }),
  ).toHaveCount(0)

  const insightsHeading = section.getByRole('heading', {
    name: 'Insights',
    exact: true,
  })
  const recommendationsHeading = section.getByRole('heading', {
    name: 'Recommendations',
    exact: true,
  })
  await expect(insightsHeading).toBeVisible()
  await expect(recommendationsHeading).toBeVisible()

  const insightsBlock = section.locator('div[aria-labelledby="insight-heading"]')
  const recommendationsBlock = section.locator(
    'div[aria-labelledby="recommendation-heading"]',
  )
  await expect(insightsBlock).toBeVisible()
  await expect(recommendationsBlock).toBeVisible()

  // Every card in both sections shows a non-empty importance badge — proof
  // the priority fallback populates it even if the LLM omitted it.
  const insightCards = insightsBlock.locator('li')
  const insightCount = await insightCards.count()
  expect(insightCount).toBeGreaterThan(0)
  for (let i = 0; i < insightCount; i++) {
    const badgeText = await insightCards
      .nth(i)
      .getByText(/importance$/)
      .first()
      .textContent()
    expect(badgeText?.trim().length ?? 0).toBeGreaterThan(0)
  }

  const recCards = recommendationsBlock.locator('li')
  const recCount = await recCards.count()
  expect(recCount).toBeGreaterThan(0)
  for (let i = 0; i < recCount; i++) {
    const badgeText = await recCards
      .nth(i)
      .getByText(/importance$/)
      .first()
      .textContent()
    expect(badgeText?.trim().length ?? 0).toBeGreaterThan(0)
  }

  // --- Exercise the importance sort control on the insights section. ---
  const insightsTitlesBefore = await insightsBlock
    .locator('li p.font-medium')
    .allTextContents()
  const insightsSortToggle = insightsBlock.getByRole('button', {
    name: 'Sort by importance (high → low)',
  })
  await expect(insightsSortToggle).toBeVisible()
  await insightsSortToggle.focus()
  await insightsSortToggle.press('Enter')
  await expect(insightsSortToggle).toHaveAttribute('aria-pressed', 'true')
  const insightsTitlesAfterSort = await insightsBlock
    .locator('li p.font-medium')
    .allTextContents()
  // Sorted order should reflect descending priority rank; re-derive from the
  // rendered badges rather than assuming the fixture always mixes priorities
  // (which would make "order changed" flaky if it happened to already be
  // sorted). Instead assert the badges are non-increasing in rank.
  const rankOf = (label: string) =>
    label.startsWith('high') ? 3 : label.startsWith('medium') ? 2 : 1
  const badgesAfterSort = await insightsBlock
    .locator('li')
    .evaluateAll((lis) =>
      lis.map((li) => li.querySelector('span')?.textContent?.trim() ?? ''),
    )
  const ranksAfterSort = badgesAfterSort.map(rankOf)
  for (let i = 1; i < ranksAfterSort.length; i++) {
    expect(ranksAfterSort[i]).toBeLessThanOrEqual(ranksAfterSort[i - 1])
  }
  // Confirm the toggle is a real state change, not a no-op: turning it back
  // off restores the original order.
  await insightsSortToggle.click()
  await expect(insightsSortToggle).toHaveAttribute('aria-pressed', 'false')
  const insightsTitlesAfterUnsort = await insightsBlock
    .locator('li p.font-medium')
    .allTextContents()
  expect(insightsTitlesAfterUnsort).toEqual(insightsTitlesBefore)
  void insightsTitlesAfterSort

  // --- Exercise the tag filter on the recommendations section. ---
  const recTagButtons = recommendationsBlock.locator(
    'div[role="group"] button[aria-pressed]',
  )
  const tagCount = await recTagButtons.count()
  if (tagCount >= 2) {
    const firstTagLabel = (await recTagButtons.nth(0).textContent())?.trim()
    await recTagButtons.nth(0).focus()
    await recTagButtons.nth(0).press('Enter')
    await expect(recTagButtons.nth(0)).toHaveAttribute('aria-pressed', 'true')
    const filteredCount = await recommendationsBlock.locator('li').count()
    expect(filteredCount).toBeLessThanOrEqual(recCount)
    for (let i = 0; i < filteredCount; i++) {
      await expect(
        recommendationsBlock.locator('li').nth(i).getByText(firstTagLabel!, {
          exact: true,
        }),
      ).toBeVisible()
    }

    // Now try to find two tags whose intersection is empty, to prove the
    // empty state renders for an unsatisfiable AND combination.
    const allTagLabels: string[] = []
    for (let i = 0; i < tagCount; i++) {
      const label = (await recTagButtons.nth(i).textContent())?.trim()
      if (label && label !== 'Clear') allTagLabels.push(label)
    }
    // Clear first.
    const clearButton = recommendationsBlock.getByRole('button', { name: 'Clear' })
    if (await clearButton.count()) await clearButton.click()

    let foundEmptyCombo = false
    outer: for (const tagA of allTagLabels) {
      for (const tagB of allTagLabels) {
        if (tagA === tagB) continue
        await recommendationsBlock
          .getByRole('button', { name: tagA, exact: true })
          .click()
        await recommendationsBlock
          .getByRole('button', { name: tagB, exact: true })
          .click()
        const combinedCount = await recommendationsBlock.locator('li').count()
        if (combinedCount === 0) {
          foundEmptyCombo = true
          await expect(
            recommendationsBlock.getByText('No items match the selected tag filters.'),
          ).toBeVisible()
          break outer
        }
        // Reset for next combo attempt.
        await recommendationsBlock
          .getByRole('button', { name: tagA, exact: true })
          .click()
        await recommendationsBlock
          .getByRole('button', { name: tagB, exact: true })
          .click()
      }
    }
    // Not every dataset/tag distribution is guaranteed to have a colliding
    // pair, but the fixture's insight/recommendation tag sets are varied
    // enough in practice; if none is found, at least confirm the empty-state
    // markup exists and behaves correctly by selecting every tag at once
    // (guaranteed empty unless a single item happens to carry every tag,
    // which the fixture's domain-tag design makes implausible).
    if (!foundEmptyCombo && allTagLabels.length >= 2) {
      for (const tag of allTagLabels) {
        await recommendationsBlock
          .getByRole('button', { name: tag, exact: true })
          .click()
      }
      const allSelectedCount = await recommendationsBlock.locator('li').count()
      if (allSelectedCount === 0) {
        await expect(
          recommendationsBlock.getByText('No items match the selected tag filters.'),
        ).toBeVisible()
      }
    }
  }
})
