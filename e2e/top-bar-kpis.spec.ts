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
    page.getByRole('heading', { name: 'Dashboard' }),
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

  // 2a. Every KPI card shows its actual computed/estimated value, not just a
  // qualitative description — schema-enforced (every "kpi" item must set
  // metadata.value) after live testing found some KPIs (e.g. a rate/
  // percentage the model found harder to quantify) rendering as a
  // description-only card with no number at all. `TopBarKpiCard` renders the
  // value in a `font-bold` `<dd>`; the qualitative-description fallback uses
  // `line-clamp-2` instead — real cards must never fall into that branch.
  const cardValues = kpiRegion.locator('dd')
  const cardValueCount = await cardValues.count()
  for (let i = 0; i < cardValueCount; i++) {
    const valueEl = cardValues.nth(i)
    await expect(valueEl).not.toHaveClass(/line-clamp-2/)
    const valueText = (await valueEl.textContent())?.trim() ?? ''
    expect(valueText.length).toBeGreaterThan(0)
  }

  // 2b. Each KPI card is now a real button (UX fix: two-line clamping hid
  // longer content with no way to read the rest) — clicking one opens a
  // modal with that same KPI's full, unclamped title/description, and
  // Escape closes it again.
  const firstKpiCard = kpiRegion.getByRole('button').first()
  const firstCardTitle = (await firstKpiCard.locator('dt').textContent())?.trim()
  await firstKpiCard.click()
  const kpiModal = page.getByRole('dialog', { name: firstCardTitle ?? undefined })
  await expect(kpiModal).toBeVisible()
  // `getByRole('heading', ...)`, not `getByText` — the KPI's own description
  // can loosely/case-insensitively contain its title as a substring (e.g.
  // "Total Revenue" the heading vs. "...total revenue generated..." the
  // description), which `getByText` matches ambiguously (strict-mode
  // violation) but the heading role does not.
  await expect(
    kpiModal.getByRole('heading', { name: firstCardTitle ?? undefined }),
  ).toBeVisible()

  // Real geometry check (not just visibility): the modal must be positioned
  // relative to the true viewport, not squeezed inside the (short) top-bar
  // header — a real bug caused by `<header>`'s `backdrop-blur` creating a
  // new containing block for `position: fixed` descendants, fixed by
  // portaling the modal into `document.body`. Horizontally centered, with a
  // real top margin (not vertically centered) so a tall KPI's full content
  // is always reachable, not clipped by the header's own height.
  const viewportSize = page.viewportSize()
  expect(viewportSize).not.toBeNull()
  const modalBox = await kpiModal.boundingBox()
  expect(modalBox).not.toBeNull()
  const viewportCenterX = viewportSize!.width / 2
  const modalCenterX = modalBox!.x + modalBox!.width / 2
  expect(Math.abs(modalCenterX - viewportCenterX)).toBeLessThan(2)
  expect(modalBox!.y).toBeGreaterThan(60) // real top margin, not flush/clipped against the header
  expect(modalBox!.y + modalBox!.height).toBeLessThanOrEqual(viewportSize!.height)

  await page.keyboard.press('Escape')
  await expect(kpiModal).toBeHidden()

  // 3. Switch to a second, different dataset via History's "New dataset".
  await page.getByRole('button', { name: /^History/ }).click()
  const historyDialog = page.getByRole('dialog', { name: 'Dataset history' })
  await expect(historyDialog).toBeVisible()
  await historyDialog.getByRole('button', { name: 'New dataset' }).click()
  await expect(page.getByRole('dialog', { name: /upload/i })).toBeVisible()

  await page.locator('input[type="file"]').setInputFiles(DATASET_B)
  await expect(
    page.getByRole('heading', { name: 'Dashboard' }),
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
    page.getByRole('heading', { name: 'Dashboard' }),
  ).toBeVisible()

  const cardTitlesAAgain = await kpiCard(kpiRegion).allTextContents()
  expect(cardTitlesAAgain).toEqual(cardTitlesA)
  expect(cardTitlesAAgain).not.toEqual(cardTitlesB)
})
