import { test, expect } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import { PDFParse } from 'pdf-parse'

/**
 * End-to-end verification of Phase 11, Milestone 11.1 "PDF report
 * generation": clicking the sidebar's "Download PDF Report" button for the
 * currently active dataset produces a real, multi-page, client-presentable
 * PDF — not the old console-log stub, and not a raw single-page screenshot
 * dump. Hits real Mistral/Gemini APIs for the pipeline (the report's
 * Explanation/Business Insights/Client Questions sections all depend on it
 * finishing), so this uses a generous `test.setTimeout` matching
 * `dashboard.spec.ts`/`pipeline.spec.ts`'s convention.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATASET_A = path.resolve(__dirname, '../docs/lakeside_orders_sample.csv')

test('Download PDF Report produces a real multi-page PDF covering dashboard, explanation, insights, questions, and data quality', async ({
  page,
}) => {
  test.setTimeout(300_000)

  await page.goto('/')
  await page.evaluate(() => indexedDB.deleteDatabase('keyrus-dataset-analyzer'))
  await page.reload()

  await page.locator('input[type="file"]').setInputFiles(DATASET_A)
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({
    timeout: 15_000,
  })

  // Wait for the whole pipeline to finish — the PDF's Explanation/Business
  // Insights/Client Questions sections all read from its output.
  await expect(page.getByRole('status', { name: 'Loading overlay' })).toBeHidden({
    timeout: 200_000,
  })

  const downloadPdfButton = page.getByRole('button', { name: 'Download PDF Report' })
  await expect(downloadPdfButton).toBeVisible()

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    downloadPdfButton.click(),
  ])

  // Button reflects the async generation, then returns to its resting label.
  await expect(downloadPdfButton).toHaveText('Download PDF Report', { timeout: 15_000 })

  expect(download.suggestedFilename()).toBe('lakeside_orders_sample-report.pdf')

  const downloadPath = await download.path()
  expect(downloadPath).toBeTruthy()
  const buffer = await readFile(downloadPath as string)

  // --- It's a genuine PDF file, not an empty/corrupt download. ---
  expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-')
  expect(buffer.byteLength).toBeGreaterThan(5_000) // a real multi-section document, not a near-empty shell

  const parser = new PDFParse({ data: buffer })
  const info = await parser.getInfo()
  const textResult = await parser.getText()
  await parser.destroy()

  // --- Real multi-page report, not a single dumped screenshot. ---
  expect(info.total).toBeGreaterThan(1)

  const fullText = textResult.text
  // --- Title/overview: names this specific dataset, not a placeholder. ---
  expect(fullText).toContain('Data Analysis Report')
  expect(fullText).toContain('lakeside_orders_sample.csv')

  // --- Dashboard section: real KPI labels from computeDashboardKpis, not zeros/placeholders. ---
  expect(fullText).toContain('Rows in view')
  expect(fullText).toContain('Dashboard')

  // --- Section headings for every part of the milestone's required coverage. ---
  expect(fullText).toContain('Explanation')
  expect(fullText).toContain('Business Insights')
  expect(fullText).toContain('Client Questions')
  expect(fullText).toContain('Data Quality Summary')

  // --- Explanation: real generated prose, not the "not generated" placeholder. ---
  expect(fullText).not.toContain('Explanation\n\nNot generated for this session.')

  // --- Business insights: at least one real KPI/insight/recommendation heading rendered as text content. ---
  expect(fullText).toContain('Key Performance Indicators')
  expect(fullText).toContain('Recommendations')

  // --- Data quality: real figures for this fixture (not just headings). ---
  expect(fullText).toMatch(/Missing values: \d[\d,]* across \d+ column/)
  expect(fullText).toMatch(/Duplicate rows: \d[\d,]*/)
})
