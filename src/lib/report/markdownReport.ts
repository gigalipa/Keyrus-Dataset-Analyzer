/**
 * Phase 5, Milestone 5.3 "download report button" — assembles a single
 * Markdown document out of everything available for the current dataset:
 * the Phase 3 analysis (structure, quality, numeric, dates) plus whatever
 * Phase 4 LLM content the consultant has already generated (data dictionary,
 * business insights, client questions). Sections for content that hasn't
 * been generated yet are noted as "not generated" rather than omitted
 * silently or causing a crash.
 *
 * PRODUCT DECISION (do not relitigate): Markdown-only for now, no PDF
 * library. A fully-formatted PDF export remains the intended finished-product
 * goal for a future iteration — this Markdown export is a deliberate
 * intermediate step, not the final intended state of "download report".
 */
import type { AnalysisResult } from '../../types/upload'
import type { InsightGroup, InsightItem } from '../llm/schema'
import type { BusinessInsightsResult } from '../llm/businessInsights'

export interface ReportLlmContent {
  /** Data dictionary `InsightGroup`, or `null`/`undefined` if not yet generated. */
  dictionary?: InsightGroup | null
  /** Business insights (KPIs/insights/recommendations), or `null`/`undefined` if not yet generated. */
  businessInsights?: BusinessInsightsResult | null
  /** Client questions items, or `null`/`undefined` if not yet generated. */
  clientQuestions?: InsightItem[] | null
}

/** Escapes characters that would otherwise break Markdown table cells. */
function escapeCell(value: unknown): string {
  return String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
}

function formatItem(item: InsightItem): string {
  const lines = [
    `- **${item.title}**${item.priority ? ` (${item.priority})` : ''}`,
  ]
  lines.push(`  ${item.description}`)
  if (item.tags.length > 0) lines.push(`  _Tags: ${item.tags.join(', ')}_`)
  return lines.join('\n')
}

function formatGroup(group: InsightGroup): string {
  if (group.items.length === 0) return '_No items generated._'
  return group.items.map(formatItem).join('\n\n')
}

/**
 * Builds the full Markdown report for `analysis` + `file`, folding in
 * whatever LLM content (`llmContent`) has already been generated. Never
 * throws on missing LLM content — sections are noted "not generated"
 * instead.
 */
export function buildMarkdownReport(
  analysis: AnalysisResult,
  file: File,
  llmContent: ReportLlmContent = {},
): string {
  const { structural, quality, numeric, dates, uploadedAt } = analysis
  const generatedAt = new Date().toLocaleString()
  const uploadedAtLabel = new Date(uploadedAt).toLocaleString()

  const sections: string[] = []

  sections.push(`# Data Analysis Report: ${file.name}`)
  sections.push(
    `Generated ${generatedAt} · Dataset uploaded ${uploadedAtLabel}`,
  )

  // --- Overview -----------------------------------------------------------
  sections.push(
    [
      '## Overview',
      '',
      `- **File name:** ${file.name}`,
      `- **Rows:** ${structural.stats.totalRows.toLocaleString()}`,
      `- **Columns:** ${structural.stats.totalColumns.toLocaleString()}`,
      `- **File size:** ${structural.stats.fileSizeMB.toFixed(2)} MB`,
    ].join('\n'),
  )

  // --- Column structure -----------------------------------------------------
  const columnRows = structural.columns.map((column) => {
    const numericStats = numeric.find((n) => n.column === column.name)
    const dateStats = dates.find((d) => d.column === column.name)
    const extra = numericStats
      ? `mean ${numericStats.mean.toFixed(2)}, min ${numericStats.min}, max ${numericStats.max}`
      : dateStats
        ? `${dateStats.minDate} to ${dateStats.maxDate}`
        : '—'
    return `| ${escapeCell(column.name)} | ${escapeCell(column.dataType)} | ${extra} |`
  })
  sections.push(
    [
      '## Column Structure',
      '',
      '| Column | Type | Notes |',
      '| --- | --- | --- |',
      ...columnRows,
    ].join('\n'),
  )

  // --- Data quality ---------------------------------------------------------
  const missingRows = quality.missingValues
    .filter((r) => r.count > 0)
    .map(
      (r) =>
        `| ${escapeCell(r.affectedColumns[0] ?? 'Unknown')} | ${r.count.toLocaleString()} | ${r.percentage.toFixed(1)}% |`,
    )
  const outlierRows = numeric
    .filter((n) => n.outliers.length > 0)
    .map(
      (n) =>
        `| ${escapeCell(n.column)} | ${n.outliers.length.toLocaleString()} |`,
    )

  sections.push(
    [
      '## Data Quality Summary',
      '',
      `- **Duplicate rows:** ${quality.duplicateRows.count.toLocaleString()} (${quality.duplicateRows.description})`,
      '',
      '### Missing values by column',
      missingRows.length > 0
        ? [
            '| Column | Count | Percentage |',
            '| --- | --- | --- |',
            ...missingRows,
          ].join('\n')
        : '_No missing values found._',
      '',
      '### Outliers by column',
      outlierRows.length > 0
        ? ['| Column | Outlier count |', '| --- | --- |', ...outlierRows].join(
            '\n',
          )
        : '_No IQR outliers found._',
    ].join('\n'),
  )

  // --- Data dictionary --------------------------------------------------
  sections.push(
    [
      '## Data Dictionary',
      '',
      llmContent.dictionary
        ? formatGroup(llmContent.dictionary)
        : '_Not generated for this session._',
    ].join('\n'),
  )

  // --- Business insights ----------------------------------------------
  const insightsBody = llmContent.businessInsights
    ? [
        '### Key Performance Indicators',
        '',
        formatGroup(llmContent.businessInsights.kpis),
        '',
        '### Insights',
        '',
        formatGroup(llmContent.businessInsights.insights),
        '',
        '### Recommendations',
        '',
        formatGroup(llmContent.businessInsights.recommendations),
      ].join('\n')
    : '_Not generated for this session._'
  sections.push(['## Business Insights', '', insightsBody].join('\n'))

  // --- Client questions --------------------------------------------------
  const questionsBody =
    llmContent.clientQuestions && llmContent.clientQuestions.length > 0
      ? llmContent.clientQuestions
          .map(
            (item, index) =>
              `${index + 1}. **${item.title}** — ${item.description}`,
          )
          .join('\n')
      : '_Not generated for this session._'
  sections.push(['## Client Questions', '', questionsBody].join('\n'))

  return sections.join('\n\n') + '\n'
}

/**
 * Triggers a browser download of `content` as a `.md` file named
 * `fileName`, via a `Blob` + temporary `<a download>` click — the standard
 * no-backend approach for this app (no server to stream a file from).
 */
export function downloadMarkdown(fileName: string, content: string): void {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

/** Derives a `<basename>-report.md` download name from the original dataset file name. */
export function reportFileName(originalFileName: string): string {
  const base = originalFileName.replace(/\.[^./\\]+$/, '')
  return `${base || 'dataset'}-report.md`
}
