/**
 * Milestone 11.1 "PDF report generation" — draws `PdfReportContent`
 * (`pdfReportContent.ts`) into a real, multi-page, client-presentable jsPDF
 * document: headings, paragraphs, bullet cards, and simple tables via
 * jsPDF's own text/vector drawing API (never a DOM screenshot), plus the
 * two Dashboard chart images `captureChartImages.tsx` already rendered and
 * captured separately. This keeps the "not a raw screenshot dump"
 * constraint honest — only the two chart visuals are images; every other
 * section is real selectable text laid out with an explicit page-break-
 * aware cursor (`PdfCursor` below).
 */
import { jsPDF } from 'jspdf'
import type { AnalysisResult } from '../../types/upload'
import type { PersistedDataset } from '../../types/persistedDataset'
import { gatherPdfReportContent, pdfReportFileName, type PdfReportContent } from './pdfReportContent'
import { captureChartImages, type ChartImage } from './captureChartImages'

const PAGE_MARGIN = 40
type RGB = [number, number, number]

const COLOR_HEADING: RGB = [15, 23, 42]
const COLOR_SUBHEADING: RGB = [30, 41, 59]
const COLOR_BODY: RGB = [51, 65, 85]
const COLOR_MUTED: RGB = [100, 116, 139]
const COLOR_FAINT: RGB = [148, 163, 184]
const COLOR_RULE: RGB = [203, 213, 225]

const SEVERITY_LABEL: Record<string, string> = {
  error: 'ISSUE',
  warning: 'WARNING',
  info: 'INFO',
}

/**
 * Page-break-aware layout cursor: every drawing method advances `y` and
 * calls `addPage()` first whenever the next chunk wouldn't fit, so the
 * report is a genuine multi-page document shaped by its actual content
 * length rather than a fixed number of pages.
 */
class PdfCursor {
  doc: jsPDF
  y: number
  readonly pageWidth: number
  readonly pageHeight: number
  readonly contentWidth: number

  constructor(doc: jsPDF) {
    this.doc = doc
    this.pageWidth = doc.internal.pageSize.getWidth()
    this.pageHeight = doc.internal.pageSize.getHeight()
    this.contentWidth = this.pageWidth - PAGE_MARGIN * 2
    this.y = PAGE_MARGIN
  }

  private ensureSpace(height: number): void {
    if (this.y + height > this.pageHeight - PAGE_MARGIN) {
      this.doc.addPage()
      this.y = PAGE_MARGIN
    }
  }

  addSpacing(height: number): void {
    this.y += height
  }

  sectionHeading(text: string): void {
    this.ensureSpace(34)
    this.doc.setFont('helvetica', 'bold')
    this.doc.setFontSize(16)
    this.doc.setTextColor(...COLOR_HEADING)
    this.doc.text(text, PAGE_MARGIN, this.y)
    this.y += 10
    this.doc.setDrawColor(...COLOR_RULE)
    this.doc.line(PAGE_MARGIN, this.y, this.pageWidth - PAGE_MARGIN, this.y)
    this.y += 18
  }

  subHeading(text: string): void {
    this.ensureSpace(20)
    this.doc.setFont('helvetica', 'bold')
    this.doc.setFontSize(12)
    this.doc.setTextColor(...COLOR_SUBHEADING)
    this.doc.text(text, PAGE_MARGIN, this.y)
    this.y += 16
  }

  paragraph(text: string, opts: { fontSize?: number; bold?: boolean; color?: RGB } = {}): void {
    const fontSize = opts.fontSize ?? 10
    this.doc.setFont('helvetica', opts.bold ? 'bold' : 'normal')
    this.doc.setFontSize(fontSize)
    this.doc.setTextColor(...(opts.color ?? COLOR_BODY))
    const lines = this.doc.splitTextToSize(text, this.contentWidth) as string[]
    const lineHeight = fontSize * 1.35
    for (const line of lines) {
      this.ensureSpace(lineHeight)
      this.doc.text(line, PAGE_MARGIN, this.y)
      this.y += lineHeight
    }
  }

  /** A titled card: bold title line, indented description, optional small meta line — the PDF's equivalent of the app's insight/question cards. */
  card(title: string, description: string, meta?: string): void {
    this.ensureSpace(16)
    this.doc.setFont('helvetica', 'bold')
    this.doc.setFontSize(10.5)
    this.doc.setTextColor(...COLOR_HEADING)
    const titleLines = this.doc.splitTextToSize(title, this.contentWidth) as string[]
    for (const line of titleLines) {
      this.ensureSpace(14)
      this.doc.text(line, PAGE_MARGIN, this.y)
      this.y += 14
    }

    this.doc.setFont('helvetica', 'normal')
    this.doc.setFontSize(9.5)
    this.doc.setTextColor(...COLOR_BODY)
    const descLines = this.doc.splitTextToSize(description, this.contentWidth - 12) as string[]
    for (const line of descLines) {
      this.ensureSpace(13)
      this.doc.text(line, PAGE_MARGIN + 12, this.y)
      this.y += 13
    }

    if (meta) {
      this.ensureSpace(12)
      this.doc.setFont('helvetica', 'italic')
      this.doc.setFontSize(8)
      this.doc.setTextColor(...COLOR_FAINT)
      this.doc.text(meta, PAGE_MARGIN + 12, this.y)
      this.y += 12
    }

    this.y += 8
  }

  /** A minimal left-aligned table — no external table plugin; adequate for this report's short, few-column data. */
  table(headers: string[], rows: string[][]): void {
    if (rows.length === 0) return
    const colWidth = this.contentWidth / headers.length

    this.ensureSpace(20)
    this.doc.setFont('helvetica', 'bold')
    this.doc.setFontSize(9.5)
    this.doc.setTextColor(...COLOR_HEADING)
    headers.forEach((header, i) => this.doc.text(header, PAGE_MARGIN + i * colWidth, this.y))
    this.y += 4
    this.doc.setDrawColor(...COLOR_RULE)
    this.doc.line(PAGE_MARGIN, this.y, this.pageWidth - PAGE_MARGIN, this.y)
    this.y += 13

    this.doc.setFont('helvetica', 'normal')
    this.doc.setFontSize(9.5)
    this.doc.setTextColor(...COLOR_BODY)
    for (const row of rows) {
      // A wrapped cell (long column name, etc.) can span more than one
      // line — size the row to the tallest cell instead of a fixed height,
      // so long text can't overlap the next row.
      const cellLineCounts = row.map(
        (cell) => (this.doc.splitTextToSize(cell, colWidth - 6) as string[]).length,
      )
      const rowHeight = Math.max(...cellLineCounts, 1) * 14
      this.ensureSpace(rowHeight)
      row.forEach((cell, i) =>
        this.doc.text(cell, PAGE_MARGIN + i * colWidth, this.y, { maxWidth: colWidth - 6 }),
      )
      this.y += rowHeight
    }
    this.y += 8
  }

  /** Embeds a captured chart PNG, scaled to the page's content width, preceded by its title. */
  image(title: string, dataUrl: string, naturalWidth: number, naturalHeight: number): void {
    const width = this.contentWidth
    const height = naturalHeight * (width / naturalWidth)
    this.ensureSpace(height + 24)
    this.doc.setFont('helvetica', 'bold')
    this.doc.setFontSize(10.5)
    this.doc.setTextColor(...COLOR_HEADING)
    this.doc.text(title, PAGE_MARGIN, this.y)
    this.y += 10
    this.doc.addImage(dataUrl, 'PNG', PAGE_MARGIN, this.y, width, height)
    this.y += height + 16
  }
}

function notGenerated(cursor: PdfCursor): void {
  cursor.paragraph('Not generated for this session.', { color: COLOR_FAINT })
}

/** Builds the complete, multi-page report document. Never throws on missing LLM content — mirrors `pdfReportContent.ts`'s honest "not generated" convention section by section. */
export function buildPdfDocument(content: PdfReportContent, chartImages: ChartImage[]): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const cursor = new PdfCursor(doc)

  // --- Title ---------------------------------------------------------------
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(...COLOR_HEADING)
  const titleLines = doc.splitTextToSize(
    `Data Analysis Report: ${content.fileName}`,
    cursor.contentWidth,
  ) as string[]
  for (const line of titleLines) {
    doc.text(line, PAGE_MARGIN, cursor.y)
    cursor.y += 24
  }
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...COLOR_MUTED)
  doc.text(
    `Generated ${new Date(content.generatedAt).toLocaleString()} · Dataset uploaded ${new Date(content.uploadedAt).toLocaleString()}`,
    PAGE_MARGIN,
    cursor.y,
  )
  cursor.y += 26

  // --- Overview --------------------------------------------------------------
  cursor.subHeading('Overview')
  cursor.paragraph(
    `${content.overview.rows.toLocaleString()} rows · ${content.overview.columns.toLocaleString()} columns · ${content.overview.fileSizeMB.toFixed(2)} MB`,
  )
  cursor.addSpacing(6)

  // --- Dashboard ---------------------------------------------------------
  cursor.sectionHeading('Dashboard')
  if (content.dashboard.filterColumnLabel) {
    cursor.paragraph(
      `The live app lets a viewer segment this dashboard by "${content.dashboard.filterColumnLabel}"; every figure below covers all rows.`,
      { fontSize: 8.5, color: COLOR_FAINT },
    )
    cursor.addSpacing(4)
  }

  cursor.subHeading('KPIs')
  cursor.table(
    ['Metric', 'Value', 'Detail'],
    content.dashboard.kpis.map((kpi) => [kpi.label, kpi.value, kpi.caption]),
  )

  cursor.subHeading('Notices')
  if (content.dashboard.notices.length === 0) {
    cursor.paragraph('No notices.', { color: COLOR_FAINT })
  } else {
    for (const notice of content.dashboard.notices) {
      cursor.paragraph(`[${SEVERITY_LABEL[notice.severity] ?? notice.severity.toUpperCase()}] ${notice.text}`)
    }
  }
  cursor.addSpacing(6)

  if (chartImages.length > 0) {
    cursor.subHeading('Charts')
    for (const image of chartImages) {
      cursor.image(image.title, image.dataUrl, image.width, image.height)
    }
  } else if (content.dashboard.charts.length === 0) {
    cursor.subHeading('Charts')
    cursor.paragraph('No columns in this dataset support a chart.', { color: COLOR_FAINT })
  }

  // --- Data dictionary -----------------------------------------------------
  cursor.sectionHeading('Data Dictionary')
  if (content.dataDictionary && content.dataDictionary.items.length > 0) {
    for (const item of content.dataDictionary.items) {
      cursor.card(item.title, item.description, item.tags.length > 0 ? item.tags.join(', ') : undefined)
    }
  } else {
    notGenerated(cursor)
  }

  // --- Explanation -----------------------------------------------------------
  cursor.sectionHeading('Explanation')
  if (content.explanation) {
    cursor.subHeading(content.explanation.title)
    cursor.paragraph(content.explanation.description)
  } else {
    notGenerated(cursor)
  }

  // --- Business insights -------------------------------------------------
  cursor.sectionHeading('Business Insights')
  if (content.businessInsights) {
    cursor.subHeading('Key Performance Indicators')
    if (content.businessInsights.kpis.items.length === 0) {
      cursor.paragraph('No items generated.', { color: COLOR_FAINT })
    }
    for (const item of content.businessInsights.kpis.items) {
      cursor.card(item.title, item.description, item.tags.length > 0 ? item.tags.join(', ') : undefined)
    }

    cursor.subHeading('Insights')
    if (content.businessInsights.insights.items.length === 0) {
      cursor.paragraph('No items generated.', { color: COLOR_FAINT })
    }
    for (const item of content.businessInsights.insights.items) {
      cursor.card(item.title, item.description, item.tags.length > 0 ? item.tags.join(', ') : undefined)
    }

    cursor.subHeading('Recommendations')
    if (content.businessInsights.recommendations.items.length === 0) {
      cursor.paragraph('No items generated.', { color: COLOR_FAINT })
    }
    for (const item of content.businessInsights.recommendations.items) {
      cursor.card(item.title, item.description, item.tags.length > 0 ? item.tags.join(', ') : undefined)
    }
  } else {
    notGenerated(cursor)
  }

  // --- Client questions --------------------------------------------------
  cursor.sectionHeading('Client Questions')
  if (content.clientQuestions && content.clientQuestions.length > 0) {
    content.clientQuestions.forEach((item, index) => {
      cursor.card(
        `${index + 1}. ${item.title}`,
        item.description,
        item.tags.length > 0 ? item.tags.join(', ') : undefined,
      )
    })
  } else {
    notGenerated(cursor)
  }

  // --- Data quality summary -----------------------------------------------
  cursor.sectionHeading('Data Quality Summary')
  cursor.paragraph(
    `Missing values: ${content.quality.totalMissing.toLocaleString()} across ${content.quality.missingRows.length} column(s).`,
  )
  cursor.paragraph(
    `Duplicate rows: ${content.quality.duplicateCount.toLocaleString()} (${content.quality.duplicateDescription})`,
  )
  cursor.paragraph(
    `Outliers: ${content.quality.totalOutliers.toLocaleString()} across ${content.quality.outlierRows.length} numeric column(s).`,
  )
  cursor.addSpacing(6)

  if (content.quality.missingRows.length > 0) {
    cursor.subHeading('Missing values by column')
    cursor.table(
      ['Column', 'Count', 'Percentage'],
      content.quality.missingRows.map((row) => [
        row.column,
        row.count.toLocaleString(),
        `${row.percentage.toFixed(1)}%`,
      ]),
    )
  }

  if (content.quality.outlierRows.length > 0) {
    cursor.subHeading('Outliers by column')
    cursor.table(
      ['Column', 'Outlier count'],
      content.quality.outlierRows.map((row) => [row.column, row.count.toLocaleString()]),
    )
  }

  if (content.cleaningSummary && content.cleaningSummary.length > 0) {
    cursor.subHeading('How issues were managed (automated cleaning)')
    cursor.table(
      ['Change type', 'Entries', 'Rows affected'],
      content.cleaningSummary.map((row) => [
        row.label,
        row.count.toLocaleString(),
        row.affectedRows.toLocaleString(),
      ]),
    )
  }

  return doc
}

/**
 * Orchestrates the full PDF report flow the Sidebar's "Download PDF Report"
 * button triggers: gather content (pure, synchronous), capture the
 * Dashboard's chart visuals (the one async/DOM step), draw the document,
 * then trigger a browser download via `jsPDF#save` — the same
 * `Blob`-download mechanism `markdownReport.ts`'s `downloadMarkdown` uses
 * under the hood.
 */
export async function generateAndDownloadPdfReport(
  analysis: AnalysisResult,
  file: File,
  llmOutputs: PersistedDataset['llmOutputs'],
  cleaningSlot?: PersistedDataset['cleaning'],
): Promise<void> {
  const content = gatherPdfReportContent(analysis, file, llmOutputs, cleaningSlot)
  const chartImages = await captureChartImages(content.dashboard.charts)
  const doc = buildPdfDocument(content, chartImages)
  doc.save(pdfReportFileName(file.name))
}
