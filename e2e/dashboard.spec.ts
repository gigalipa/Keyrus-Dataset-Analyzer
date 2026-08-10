import { test, expect } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * End-to-end verification of Phase 9, Milestone 9.1: the Dashboard section
 * renders live, client-computed KPIs/notices/charts plus the pipeline's
 * static "quick insights", and its category filter genuinely affects more
 * than one widget at once (the roadmap's explicit "not just one widget"
 * requirement) — here, the "Rows in view" KPI and the category-breakdown
 * bar chart, which are backed by two entirely different code paths
 * (`computeDashboardKpis` vs. `computeCategoryBreakdown`).
 *
 * Hits real Mistral/Gemini APIs for the pipeline (Quick insights depends on
 * `businessInsights` finishing), so this uses a generous `test.setTimeout`
 * matching `pipeline.spec.ts`/`explanation.spec.ts`.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATASET_A = path.resolve(__dirname, '../docs/lakeside_orders_sample.csv')
const DATASET_B = path.resolve(__dirname, './fixtures/dataset-b.csv')

test('Dashboard renders live KPIs/notices/charts/quick-insights, and the filter changes multiple widgets at once', async ({
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

  // Dashboard is now the default section (Phase 10 checkpoint change), so
  // this click is a no-op confirming that default rather than a real
  // navigation — kept for clarity/robustness against a future default change.
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click()
  const panel = page.locator('section', {
    has: page.getByRole('heading', { name: 'Dashboard', level: 2 }),
  })
  await expect(panel).toBeVisible()
  await expect(page.getByText('coming in Phase 9')).toHaveCount(0)

  // --- Filter control: a real column, auto-detected, not decorative. ---
  const filterGroup = page.getByRole('group', { name: /^Filter by / })
  await expect(filterGroup).toBeVisible()
  const filterGroupLabel = (await filterGroup.getAttribute('aria-label')) ?? ''
  expect(filterGroupLabel).toMatch(/^Filter by \S+/)

  const allChip = filterGroup.getByRole('button', { name: 'All', exact: true })
  await expect(allChip).toBeVisible()
  const otherChips = filterGroup.getByRole('button').filter({ hasNotText: 'All' })
  const chipCount = await otherChips.count()
  expect(chipCount).toBeGreaterThanOrEqual(2) // a real low-cardinality column, not a single-value dead end

  // --- KPI strip: real numbers, not zeros/placeholders. ---
  const kpiSection = page.locator('section[aria-labelledby="dashboard-kpis-heading"]')
  await expect(kpiSection).toBeVisible()
  const rowsInViewValueBefore = await kpiSection
    .getByText('Rows in view')
    .locator('xpath=following-sibling::span[1]')
    .textContent()
  const rowsBefore = Number((rowsInViewValueBefore ?? '0').replace(/,/g, ''))
  expect(rowsBefore).toBeGreaterThan(1000) // fixture has 1182 rows; unfiltered view should show (close to) all of them

  // --- Notices: real business-language text, not empty. ---
  const noticesSection = page.locator('section[aria-labelledby="dashboard-notices-heading"]')
  await expect(noticesSection.locator('li').first()).toBeVisible()
  const noticesTextBefore = (await noticesSection.innerText()).trim()
  expect(noticesTextBefore.length).toBeGreaterThan(10)

  // --- Charts: two real chart types render actual SVG data, not placeholders. ---
  const chartsSection = page.locator('section[aria-labelledby="dashboard-charts-heading"]')
  await expect(chartsSection).toBeVisible()
  // The breakdown chart's title is "Breakdown by X" (plain row counts) or
  // "Total <measure> by X" (value-weighted) depending on whether a measure
  // column was detected — `chooseDashboardCharts` prefers the more
  // informative value-weighted title when a real business measure (e.g.
  // this fixture's `line_total`) is available, so either is a valid title
  // here; this test only cares that a real breakdown chart rendered.
  const breakdownCard = chartsSection
    .locator('h4', { hasText: /^(Breakdown by |Total .+ by )/ })
    .locator('..')
  const trendCard = chartsSection.locator('h4', { hasText: /^Orders over time/ }).locator('..')
  await expect(trendCard.locator('.recharts-line-curve')).toBeVisible()
  // `ResponsiveContainer` needs a ResizeObserver tick before Recharts draws
  // any bars, so wait for at least one to exist before counting — a plain
  // `.count()` here would race that and could read 0 (test flake, not a
  // product bug: `chooseDashboardCharts` itself is a pure, dataset-derived
  // function with no timing dependency).
  const barsBefore = breakdownCard.locator('.recharts-rectangle')
  await expect(barsBefore.first()).toBeVisible()
  const barCountBefore = await barsBefore.count()
  expect(barCountBefore).toBeGreaterThanOrEqual(2) // multiple categories represented, unfiltered

  // --- Quick insights: real LLM-sourced content, once the pipeline finished (it already has, above). ---
  const quickInsightsSection = page.locator(
    'section[aria-labelledby="dashboard-quick-insights-heading"]',
  )
  await expect(quickInsightsSection).toBeVisible()
  await expect(quickInsightsSection.getByText('Generating business insights...')).toHaveCount(0)
  await expect(quickInsightsSection.getByRole('alert')).toHaveCount(0)
  const quickInsightItems = quickInsightsSection.locator('li')
  await expect(quickInsightItems.first()).toBeVisible()
  const quickInsightsTextBefore = (await quickInsightsSection.innerText()).trim()
  expect(quickInsightsTextBefore.length).toBeGreaterThan(20)

  // --- Exercise the filter: select a specific category value. ---
  const chosenChip = otherChips.first()
  const chosenValue = ((await chosenChip.textContent()) ?? '').trim()
  expect(chosenValue.length).toBeGreaterThan(0)
  await chosenChip.click()
  await expect(chosenChip).toHaveAttribute('aria-pressed', 'true')
  await expect(allChip).toHaveAttribute('aria-pressed', 'false')

  // KPI widget: "Rows in view" must actually change (narrow to the selected category).
  const rowsInViewValueAfter = await kpiSection
    .getByText('Rows in view')
    .locator('xpath=following-sibling::span[1]')
    .textContent()
  const rowsAfter = Number((rowsInViewValueAfter ?? '0').replace(/,/g, ''))
  expect(rowsAfter).toBeGreaterThan(0)
  expect(rowsAfter).toBeLessThan(rowsBefore)

  // Chart widget: the breakdown chart is keyed on the SAME column the filter
  // operates on, so selecting one value must collapse it to exactly one bar.
  const barsAfter = breakdownCard.locator('.recharts-rectangle')
  await expect(barsAfter).toHaveCount(1)
  await expect(breakdownCard.locator('svg').getByText(chosenValue)).toBeVisible()

  // Quick insights are explicitly dataset-wide (static, not filter-reactive)
  // — confirm they say so honestly rather than silently doing nothing.
  await expect(
    quickInsightsSection.getByText('Based on the full dataset — not affected by the filter above.'),
  ).toBeVisible()

  // --- Section-switch survival: the filter choice (local state) persists across a nav round trip. ---
  await page.getByRole('button', { name: 'Overview', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Dataset overview' })).toBeVisible()
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click()
  await expect(chosenChip).toHaveAttribute('aria-pressed', 'true')
  await expect(breakdownCard.locator('.recharts-rectangle')).toHaveCount(1)
})

/**
 * Regression test — user feedback: a dataset with no detected date column
 * left the "Orders over time" trend-chart slot permanently blank
 * ("No date column detected..."), even though the dataset had other
 * chartable columns. `dataset-b.csv` (product_id/product_name/category/
 * price/in_stock) has no date column at all, so it's a real, naturally-
 * occurring instance of the reported scenario — not a synthetic one.
 * `chooseDashboardCharts` (`dashboardMetrics.ts`) now adapts to what's
 * actually available instead of assuming a fixed trend+breakdown shape.
 */
test('Dashboard shows real, adaptively-chosen charts for a dataset with no date column', async ({
  page,
}) => {
  test.setTimeout(180_000)

  await page.goto('/')
  await page.evaluate(() => indexedDB.deleteDatabase('keyrus-dataset-analyzer'))
  await page.reload()

  await page.locator('input[type="file"]').setInputFiles(DATASET_B)
  await expect(
    page.getByRole('heading', { name: 'Dashboard', level: 2 }),
  ).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('status', { name: 'Loading overlay' })).toBeHidden({
    timeout: 150_000,
  })

  const chartsSection = page.locator('section[aria-labelledby="dashboard-charts-heading"]')
  await expect(chartsSection).toBeVisible()

  // The exact bug reported: no honest-but-unhelpful "no date column" empty
  // state, and no generic "nothing detected" fallback either — real charts
  // fill both slots using whatever this dataset actually supports.
  await expect(chartsSection.getByText('No date column detected')).toHaveCount(0)
  await expect(
    chartsSection.getByText('No columns in this dataset support a chart yet.'),
  ).toHaveCount(0)

  const chartCards = chartsSection.locator('h4')
  await expect(chartCards).toHaveCount(2)
  const chartTitles = await chartCards.allTextContents()
  for (const title of chartTitles) {
    expect(title.trim().length).toBeGreaterThan(0)
  }
  // Neither chart is the (unavailable) trend chart — both fell back to
  // category breakdowns of this dataset's actual categorical columns.
  for (const title of chartTitles) {
    expect(title).not.toMatch(/^Orders over time/)
  }

  // Real rendered chart data, not an empty SVG shell.
  const bars = chartsSection.locator('.recharts-rectangle')
  expect(await bars.count()).toBeGreaterThan(0)
})
