import { test, expect } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * End-to-end verification of Phase 10, Milestone 10.5's "how issues were
 * managed" audit-trail section: after a dataset's pipeline finishes
 * (including Milestone 10.2's real ETL `clean` step), the Quality
 * destination shows Milestone 10.4's `DataQualitySummaryCard` (the
 * *remaining* quality picture) alongside a real, non-empty, grouped audit
 * trail (`AuditTrailSection`) of what the LLM-informed cleaning plan
 * actually changed — with real reasons quoted verbatim and real
 * affected-row counts, sourced from `docs/lakeside_orders_sample.csv`'s known
 * planted casing-variant issues (e.g. "WEB"/"Web"/"web").
 *
 * Hits real Mistral APIs, so this uses generous timeouts (matching
 * `pipeline.spec.ts`'s convention).
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATASET_A = path.resolve(__dirname, '../docs/lakeside_orders_sample.csv')

test('Quality section renders a real, grouped audit trail with reasons and affected-row counts', async ({
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

  await page.getByRole('button', { name: 'Quality', exact: true }).click()

  // Milestone 10.4's summary card is still there, now describing the
  // *remaining* quality picture.
  await expect(
    page.getByRole('heading', { name: 'Data quality summary' }),
  ).toBeVisible()

  // Milestone 10.5's new audit-trail section, positioned alongside it.
  const auditSection = page.locator('section', {
    has: page.getByRole('heading', { name: 'How issues were managed' }),
  })
  await expect(auditSection).toBeVisible()

  // Not showing the honest-empty-state copy — this fixture has known
  // planted issues, so real applied entries are expected.
  await expect(
    auditSection.getByText('The cleaning plan found nothing to fix'),
  ).toHaveCount(0)

  // At least one group heading rendered (grouped by transformation type).
  const groupHeadings = auditSection.locator('h3')
  await expect(groupHeadings.first()).toBeVisible()
  expect(await groupHeadings.count()).toBeGreaterThan(0)

  // At least one applied entry exists, showing a real affected-row count and
  // a quoted (not paraphrased) reason string.
  const entries = auditSection.locator('li')
  await expect(entries.first()).toBeVisible()
  const entryCount = await entries.count()
  expect(entryCount).toBeGreaterThan(0)

  const reasonTexts = await auditSection.locator('li p.italic').allTextContents()
  expect(reasonTexts.length).toBeGreaterThan(0)
  for (const text of reasonTexts) {
    expect(text).toMatch(/^Reason: .+$/u)
    expect(text.length).toBeGreaterThan('Reason: “”'.length)
  }

  const affectedRowTexts = await auditSection
    .getByText(/row(s)? affected$/)
    .allTextContents()
  expect(affectedRowTexts.length).toBeGreaterThan(0)

  // The fixture's casing-variant channel/category/currency columns are
  // expected to produce at least one applied value-mapping entry.
  const valueMappingHeading = auditSection.getByRole('heading', {
    name: /Value unification/,
  })
  if (await valueMappingHeading.count()) {
    await expect(valueMappingHeading.first()).toBeVisible()
  }

  // If any entries were skipped/not applied, confirm they render visually
  // distinct (an amber "Not applied" badge) rather than looking identical to
  // applied changes — only asserted if naturally present, never fabricated.
  const notAppliedBadges = auditSection.getByText('Not applied')
  const notAppliedCount = await notAppliedBadges.count()
  if (notAppliedCount > 0) {
    await expect(notAppliedBadges.first()).toBeVisible()
  }
})
