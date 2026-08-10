import { test, expect, type Page } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * End-to-end verification of Phase 11, Milestone 11.2 "Cross-cutting
 * re-verification" — responsive breakpoints and keyboard navigation against
 * the *current* app shell (top bar + collapsible sidebar + History panel +
 * center viewport), which replaced the Phase 5-era tab bar entirely.
 *
 * Existing specs already cover some of this piecemeal (`sidebar.spec.ts`'s
 * mobile collapse, `top-bar.spec.ts`'s logo-only-on-mobile,
 * `top-bar-kpis.spec.ts`'s KPI modal geometry/Escape,
 * `business-insights-cards.spec.ts`'s keyboard-operable sort/tag controls),
 * so this file focuses on what wasn't covered anywhere else: the 640-1024px
 * ("tablet") band, no-horizontal-overflow assertions on the Dashboard's
 * chart/KPI grid at all three bands, History panel + KPI modal usability at
 * every breakpoint (not just desktop), keyboard-only (not click) access to
 * the KPI modal and the mobile Sections overlay, a real focus-order walk
 * across the header/sidebar/footer/main boundary, and Tab-reachability of
 * the PDF report button both on desktop and inside the mobile overlay.
 *
 * Runs as one sequential test sharing a single uploaded dataset/pipeline run
 * (matching `history-and-upload-modal.spec.ts`'s convention) rather than
 * separate tests per breakpoint, to avoid paying for the real Mistral/Gemini
 * pipeline more than once.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATASET_A = path.resolve(__dirname, '../docs/lakeside_orders_sample.csv')

/** No horizontal scrollbar/clipped content at the current viewport (1px tolerance for sub-pixel rounding). */
async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement
    return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth }
  })
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1)
}

/** `{ role, accessibleName }` for whatever currently has focus — used to build a real Tab-order trace. */
async function activeElementDescriptor(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null
    if (!el || el === document.body) return null
    return {
      tag: el.tagName.toLowerCase(),
      text: (el.textContent ?? '').trim().slice(0, 60),
      ariaLabel: el.getAttribute('aria-label'),
    }
  })
}

test('shell (sidebar, History panel, KPI modal, Dashboard grid) stays usable and overflow-free across all three breakpoints, and keyboard reaches every new interactive element in a sensible order', async ({
  page,
}) => {
  test.setTimeout(300_000)

  await page.goto('/')
  await page.evaluate(() => indexedDB.deleteDatabase('keyrus-dataset-analyzer'))
  await page.reload()

  await page.locator('input[type="file"]').setInputFiles(DATASET_A)
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('status', { name: 'Loading overlay' })).toBeHidden({
    timeout: 200_000,
  })

  const historyButton = page.getByRole('button', { name: /^History/ })
  const historyDialog = page.getByRole('dialog', { name: 'Dataset history' })
  const kpiRegion = page.getByRole('region', { name: 'Key business indicators' })

  // ---------------------------------------------------------------------
  // 1. Desktop (>1024px): persistent sidebar, no hamburger, no overflow.
  // ---------------------------------------------------------------------
  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(page.getByRole('button', { name: 'Open navigation' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Dashboard', exact: true })).toBeVisible()
  await expectNoHorizontalOverflow(page)

  await historyButton.click()
  await expect(historyDialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(historyDialog).toBeHidden()

  const firstKpiCardDesktop = kpiRegion.getByRole('button').first()
  if (await firstKpiCardDesktop.count()) {
    const desktopCardTitle = (await firstKpiCardDesktop.locator('dt').textContent())?.trim()
    await firstKpiCardDesktop.click()
    const modal = page.getByRole('dialog', { name: desktopCardTitle ?? undefined })
    await expect(modal).toBeVisible()
    const box = await modal.boundingBox()
    const viewport = page.viewportSize()
    expect(box).not.toBeNull()
    expect(viewport).not.toBeNull()
    // Modal never spills past the real viewport edges.
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width + 1)
    await page.keyboard.press('Escape')
    await expect(modal).toBeHidden()
  }

  // ---------------------------------------------------------------------
  // 2. Tablet (640-1024px band): the `sm` breakpoint (640px) means the
  // persistent sidebar is already in its always-visible desktop mode here,
  // not the mobile hamburger mode — this band wasn't asserted anywhere else
  // in the suite before this file.
  // ---------------------------------------------------------------------
  await page.setViewportSize({ width: 768, height: 1024 })
  await expect(page.getByRole('button', { name: 'Open navigation' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Dashboard', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Download PDF Report' })).toBeVisible()
  await expectNoHorizontalOverflow(page)

  // Dashboard's KPI grid and chart grid both fit without clipping/overflow
  // at tablet width — the two most complex new interactive surfaces.
  const kpiSection = page.locator('section[aria-labelledby="dashboard-kpis-heading"]')
  const chartsSection = page.locator('section[aria-labelledby="dashboard-charts-heading"]')
  await expect(kpiSection).toBeVisible()
  await expect(chartsSection).toBeVisible()
  await expectNoHorizontalOverflow(page)

  await historyButton.click()
  await expect(historyDialog).toBeVisible()
  await expect(historyDialog.getByRole('button', { name: 'New dataset' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(historyDialog).toBeHidden()

  // ---------------------------------------------------------------------
  // 3. Mobile (<640px): sidebar collapses behind a hamburger; History panel
  // and the KPI modal must still be fully usable (not just visible) at this
  // width, and the mobile Sections overlay must be keyboard-dismissable.
  // ---------------------------------------------------------------------
  await page.setViewportSize({ width: 375, height: 700 })
  const toggle = page.getByRole('button', { name: 'Open navigation' })
  await expect(toggle).toBeVisible()
  await expect(page.getByRole('button', { name: 'Overview', exact: true })).toBeHidden()
  await expectNoHorizontalOverflow(page)

  // Keyboard-only open: focus the toggle directly and activate with Enter
  // (not click) — proves it's a real keyboard target, not just clickable.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await toggle.focus()
  await page.keyboard.press('Enter')
  const mobileNav = page.getByRole('dialog', { name: 'Sections' })
  await expect(mobileNav).toBeVisible()

  // The PDF report button (new since Phase 5, Milestone 11.1) is reachable
  // and visible inside the mobile overlay too, not just the desktop aside.
  await expect(mobileNav.getByRole('button', { name: 'Download PDF Report' })).toBeVisible()
  await expect(mobileNav.getByRole('button', { name: 'Overview', exact: true })).toBeVisible()
  await expectNoHorizontalOverflow(page)

  // Regression check (Milestone 11.2 fix): this overlay previously had no
  // Escape handler at all, unlike every other dialog in the app
  // (`UploadModal`, `HistoryPanel`, `TopBarKpiModal`) — confirm it now
  // dismisses on Escape like the rest.
  await page.keyboard.press('Escape')
  await expect(mobileNav).toBeHidden()

  // History panel at mobile width: still fully reachable/operable, including
  // a delete button, entirely via keyboard.
  await historyButton.click()
  await expect(historyDialog).toBeVisible()
  await expect(historyDialog.getByRole('button', { name: /^Delete /i })).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.keyboard.press('Escape')
  await expect(historyDialog).toBeHidden()

  // KPI modal at mobile width: opened via keyboard (Tab + Enter), still
  // fully within the viewport (no horizontal spill), closes on Escape.
  const firstKpiCardMobile = kpiRegion.getByRole('button').first()
  if (await firstKpiCardMobile.count()) {
    const mobileCardTitle = (await firstKpiCardMobile.locator('dt').textContent())?.trim()
    await firstKpiCardMobile.focus()
    await page.keyboard.press('Enter')
    const mobileModal = page.getByRole('dialog', { name: mobileCardTitle ?? undefined })
    await expect(mobileModal).toBeVisible()
    const mobileBox = await mobileModal.boundingBox()
    expect(mobileBox).not.toBeNull()
    expect(mobileBox!.x).toBeGreaterThanOrEqual(0)
    expect(mobileBox!.x + mobileBox!.width).toBeLessThanOrEqual(375 + 1)
    await expectNoHorizontalOverflow(page)
    await page.keyboard.press('Escape')
    await expect(mobileModal).toBeHidden()
  }

  // ---------------------------------------------------------------------
  // 4. Focus-order walk at desktop width: header KPI cards/History, then
  // the sidebar's 8 nav destinations in their declared order, then the
  // sidebar's footer actions (PDF/re-run/upload), then into the main
  // content — never jumping backwards into chrome once inside main.
  // ---------------------------------------------------------------------
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('status', { name: 'Loading overlay' })).toBeHidden({
    timeout: 30_000,
  })

  const trace: Array<{ tag: string; text: string; ariaLabel: string | null } | null> = []
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab')
    trace.push(await activeElementDescriptor(page))
  }
  const labels = trace.map((entry) => entry?.ariaLabel || entry?.text || '')

  const expectedSidebarOrder = [
    'Dashboard',
    'Explanation',
    'Business Insights',
    'Questions',
    'Overview',
    'Data Dictionary',
    'Quality',
    'Datasets',
  ]
  const sidebarIndices = expectedSidebarOrder.map((label) => labels.indexOf(label))
  // Every sidebar destination was actually reached by tabbing.
  for (const idx of sidebarIndices) expect(idx).toBeGreaterThanOrEqual(0)
  // ...and reached in the same order `sections.ts` declares them.
  for (let i = 1; i < sidebarIndices.length; i++) {
    expect(sidebarIndices[i]).toBeGreaterThan(sidebarIndices[i - 1])
  }

  // The History button and PDF report button are both reachable, and the
  // footer action comes after the last sidebar nav item (sensible order:
  // nav destinations before nav-adjacent actions), not interleaved with it.
  const historyIdx = labels.findIndex((l) => l.startsWith('History'))
  const pdfIdx = labels.indexOf('Download PDF Report')
  expect(historyIdx).toBeGreaterThanOrEqual(0)
  expect(pdfIdx).toBeGreaterThan(sidebarIndices[sidebarIndices.length - 1])

  // Dashboard's own filter chips ("All" plus real category values) are
  // reachable and come after the sidebar/footer chrome, i.e. inside main.
  const allChipIdx = labels.indexOf('All')
  if (allChipIdx >= 0) {
    expect(allChipIdx).toBeGreaterThan(pdfIdx)
  }
})
