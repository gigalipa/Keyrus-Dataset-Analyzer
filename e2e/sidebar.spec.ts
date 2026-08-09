import { test, expect } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * End-to-end verification of Phase 7 Milestone 7.2 (sidebar mechanics) and
 * Milestone 7.3 (real per-section content in `MainViewport`, replacing the
 * 7.2 placeholder viewport): the left sidebar's 8 section destinations,
 * active-item highlighting + real content switching, mobile collapsibility
 * below the 640px (`sm`) breakpoint, the footer action buttons gated on an
 * active dataset, the always-reachable "Download report" button, and that
 * switching away from Data Dictionary and back doesn't re-trigger its
 * auto-generated LLM call.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATASET_A = path.resolve(__dirname, '../docs/lakeside_orders_sample.csv')

/**
 * Real (Milestone 7.3) content anchor per section — used both to confirm
 * the right section is showing and, for the 3 not-yet-built sections, that
 * the placeholder is honest ("coming in Phase N") rather than fabricated
 * content.
 */
const SECTION_CONTENT: Record<string, RegExp | string> = {
  Dashboard: 'coming in Phase 9',
  Explanation: 'coming in Phase 9',
  'Business Insights': 'Generate business insights',
  Questions: 'Client Questions',
  Overview: 'Dataset overview',
  'Data Dictionary': 'Data dictionary',
  Quality: 'Data quality summary',
  Datasets: 'coming in Phase 10',
}

test('sidebar sections show real content, mobile collapse, and gated footer actions', async ({
  page,
}) => {
  // Start from a clean slate: no stored datasets.
  await page.goto('/')
  await page.evaluate(() => indexedDB.deleteDatabase('keyrus-dataset-analyzer'))
  await page.reload()

  // 1. Empty state (view.kind === 'upload'): footer action buttons must not
  // be visible yet, even though the sidebar nav itself is present.
  await expect(page.getByRole('dialog', { name: /upload/i })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Download PDF Report' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Upload new dataset' })).toHaveCount(0)

  // 2. Upload a dataset. Once processing completes (view.kind === 'active')
  // the viewport shows the default (Overview) section's real content and
  // the footer buttons appear.
  await page.locator('input[type="file"]').setInputFiles(DATASET_A)
  await expect(
    page.getByRole('heading', { name: 'Dataset overview' }),
  ).toBeVisible({ timeout: 15_000 })

  const downloadPdfButton = page.getByRole('button', { name: 'Download PDF Report' })
  const uploadNewButton = page.getByRole('button', { name: 'Upload new dataset' })
  await expect(downloadPdfButton).toBeVisible()
  await expect(uploadNewButton).toBeVisible()

  // 2b. The "Download report (Markdown)" button (Milestone 7.3, relocated
  // from the old `ResultsView`) is reachable on the default section too.
  const downloadReportButton = page.getByRole('button', {
    name: 'Download report (Markdown)',
  })
  await expect(downloadReportButton).toBeVisible()

  // 3. Overview should be the highlighted/active nav item by default.
  const overviewNavItem = page.getByRole('button', { name: 'Overview', exact: true })
  await expect(overviewNavItem).toHaveAttribute('aria-current', 'page')

  // 4. Clicking each of the other 7 destinations updates both the
  // highlighted nav item and the viewport's real content, and the
  // "Download report" button stays reachable regardless of active section.
  const sections = [
    'Dashboard',
    'Explanation',
    'Business Insights',
    'Questions',
    'Data Dictionary',
    'Quality',
    'Datasets',
  ]
  for (const label of sections) {
    await page.getByRole('button', { name: label, exact: true }).click()
    await expect(page.getByRole('button', { name: label, exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await expect(overviewNavItem).not.toHaveAttribute('aria-current', 'page')
    await expect(page.locator('main').getByText(SECTION_CONTENT[label])).toBeVisible()
    await expect(downloadReportButton).toBeVisible()
  }

  // 5. Below the `sm` breakpoint, the persistent sidebar is collapsed by
  // default (nav items not visible) and a toggle reveals it without
  // obstructing the viewport beforehand.
  await page.setViewportSize({ width: 375, height: 700 })
  const toggle = page.getByRole('button', { name: 'Open navigation' })
  await expect(toggle).toBeVisible()
  await expect(page.getByRole('button', { name: 'Overview', exact: true })).toBeHidden()

  await toggle.click()
  const mobileNav = page.getByRole('dialog', { name: 'Sections' })
  await expect(mobileNav).toBeVisible()
  await expect(mobileNav.getByRole('button', { name: 'Overview', exact: true })).toBeVisible()

  // Selecting a section from the mobile overlay both switches the viewport
  // and closes the overlay again.
  await mobileNav.getByRole('button', { name: 'Dashboard', exact: true }).click()
  await expect(mobileNav).toBeHidden()
  await expect(
    page.locator('main').getByText(SECTION_CONTENT['Dashboard']),
  ).toBeVisible()

  // 6. Back at desktop width, the persistent sidebar is visible again.
  await page.setViewportSize({ width: 1280, height: 800 })
  await expect(page.getByRole('button', { name: 'Overview', exact: true })).toBeVisible()
})

test('Data Dictionary keeps its generated content across a section switch, without re-triggering generation', async ({
  page,
}) => {
  // Generous overall timeout: this test waits on a real Mistral API call.
  test.setTimeout(120_000)

  // Start from a clean slate: no stored datasets.
  await page.goto('/')
  await page.evaluate(() => indexedDB.deleteDatabase('keyrus-dataset-analyzer'))
  await page.reload()

  await page.locator('input[type="file"]').setInputFiles(DATASET_A)
  await expect(
    page.getByRole('heading', { name: 'Dataset overview' }),
  ).toBeVisible({ timeout: 15_000 })

  // Navigate to Data Dictionary. `DataDictionaryPanel` auto-triggers
  // generation on mount (Phase 4, Milestone 4.2) — it's mounted the instant
  // a dataset goes active (Milestone 7.3's "keep the 5 real sections
  // mounted at all times" requirement), so the LLM call is already
  // in-flight by the time we click over to it.
  await page.getByRole('button', { name: 'Data Dictionary', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Data dictionary' })).toBeVisible()

  // Wait for the real Mistral call to finish (success or error — either way
  // the "Generating insights..." status disappears).
  await expect(page.getByText('Generating insights...')).toBeHidden({
    timeout: 60_000,
  })

  // Snapshot whatever the panel ended up rendering (success cards, or an
  // error message) so we can prove it's byte-identical after the round trip
  // below, not just "still showing something".
  const dictionaryPanel = page.locator('section', {
    has: page.getByRole('heading', { name: 'Data dictionary' }),
  })
  const contentBefore = await dictionaryPanel.innerText()

  // Switch away, then back.
  await page.getByRole('button', { name: 'Overview', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Dataset overview' })).toBeVisible()
  await page.getByRole('button', { name: 'Data Dictionary', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Data dictionary' })).toBeVisible()

  // No fresh generation should have started: the loading indicator must not
  // reappear, and the panel's content must be exactly what it was before.
  // (Compared via `innerText()` both times rather than Playwright's
  // `toHaveText` matcher — that matcher normalizes whitespace differently
  // than `innerText()`, which would otherwise report a false mismatch even
  // though nothing regenerated.)
  await expect(page.getByText('Generating insights...')).toHaveCount(0)
  const contentAfter = await dictionaryPanel.innerText()
  expect(contentAfter).toBe(contentBefore)
})
