/**
 * Milestone 11.1 "PDF report generation" — pure, DOM-free content assembly
 * for the PDF report, mirroring `markdownReport.ts`'s pattern of pulling
 * structured data (never rendered DOM) out of `AnalysisResult` and
 * `PersistedDataset['llmOutputs']`.
 *
 * The Dashboard section of the report reuses the same pure functions
 * `DashboardPanel`/`dashboardMetrics.ts` already use to compute KPIs,
 * notices, and chart specs — run here against the *unfiltered* table (the
 * report is a snapshot of the whole dataset, not of whatever filter chip
 * happened to be selected in the live UI last). Only each chart's actual
 * visual (the Recharts SVG) needs a DOM render + `html2canvas` capture,
 * handled separately by `captureChartImages.tsx` — everything else here is
 * plain data, drawn straight into the PDF as real text/vector content by
 * `buildPdfDocument`.
 */
import type { AnalysisResult } from '../../types/upload'
import type { PersistedDataset } from '../../types/persistedDataset'
import { asSingleGroup, asBusinessInsights } from '../../types/persistedDataset'
import type { InsightGroup, InsightItem } from '../llm/schema'
import type { BusinessInsightsResult } from '../llm/businessInsights'
import type { AuditChangeType, AuditTrail } from '../etl/applyCleaningPlan'
import {
  chooseDashboardCharts,
  chooseDateColumn,
  chooseFilterColumn,
  chooseMeasureColumn,
  chooseSecondaryCategoricalColumn,
  computeDashboardKpis,
  computeDashboardNotices,
  findCategoricalCandidates,
  type DashboardChartSpec,
  type DashboardKpi,
  type DashboardNotice,
} from '../dashboard/dashboardMetrics'

export interface PdfQualityRow {
  column: string
  count: number
  percentage: number
}

export interface PdfCleaningSummaryRow {
  changeType: AuditChangeType
  label: string
  count: number
  affectedRows: number
}

export interface PdfReportDashboardContent {
  /** Column driving the dashboard's live filter in the app, or `null` if none was detected — the report always covers all rows regardless. */
  filterColumnLabel: string | null
  kpis: DashboardKpi[]
  notices: DashboardNotice[]
  /** Adaptively-chosen chart specs (see `chooseDashboardCharts`) — both the data (for a text fallback) and the input `captureChartImages` renders to PNG. */
  charts: DashboardChartSpec[]
}

export interface PdfReportContent {
  fileName: string
  generatedAt: number
  uploadedAt: number
  overview: { rows: number; columns: number; fileSizeMB: number }
  dashboard: PdfReportDashboardContent
  explanation: { title: string; description: string } | null
  businessInsights: BusinessInsightsResult | null
  clientQuestions: InsightItem[] | null
  dataDictionary: InsightGroup | null
  quality: {
    totalMissing: number
    missingRows: PdfQualityRow[]
    duplicateCount: number
    duplicateDescription: string
    totalOutliers: number
    outlierRows: { column: string; count: number }[]
  }
  /** Compact per-changeType counts from the cleaning audit trail (Phase 10), or `null` if cleaning hasn't finished / produced no data — see `AuditTrailSection` for the full, per-entry version this summarizes. */
  cleaningSummary: PdfCleaningSummaryRow[] | null
}

const CLEANING_GROUP_LABEL: Record<AuditChangeType, string> = {
  'value-mapping': 'Value unification',
  'missing-value-policy': 'Missing-value handling',
  'type-coercion': 'Type coercion',
  'skipped-invalid-column': 'Skipped / flagged, not auto-fixed',
}
const CLEANING_GROUP_ORDER: AuditChangeType[] = [
  'value-mapping',
  'missing-value-policy',
  'type-coercion',
  'skipped-invalid-column',
]

function summarizeCleaningTrail(trail: AuditTrail | null): PdfCleaningSummaryRow[] | null {
  if (!trail || trail.entries.length === 0) return trail ? [] : null
  const counts = new Map<AuditChangeType, { count: number; affectedRows: number }>()
  for (const entry of trail.entries) {
    const existing = counts.get(entry.changeType) ?? { count: 0, affectedRows: 0 }
    existing.count += 1
    existing.affectedRows += entry.applied ? entry.affectedRows : 0
    counts.set(entry.changeType, existing)
  }
  return CLEANING_GROUP_ORDER.filter((type) => counts.has(type)).map((type) => {
    const entry = counts.get(type)!
    return {
      changeType: type,
      label: CLEANING_GROUP_LABEL[type],
      count: entry.count,
      affectedRows: entry.affectedRows,
    }
  })
}

/**
 * Builds the full, DOM-free PDF report content for `analysis` + `file`,
 * folding in whatever LLM content (`llmOutputs`) has already been
 * generated and whatever cleaning audit trail (`cleaningSlot`) is
 * available. Never throws on missing content — mirrors
 * `buildMarkdownReport`'s "not generated" convention via `null` fields the
 * PDF builder renders as an honest placeholder line.
 */
export function gatherPdfReportContent(
  analysis: AnalysisResult,
  file: File,
  llmOutputs: PersistedDataset['llmOutputs'],
  cleaningSlot?: PersistedDataset['cleaning'],
): PdfReportContent {
  const { structural, quality, numeric, dates, table, uploadedAt } = analysis

  // --- Dashboard: same pure functions DashboardPanel uses, run unfiltered. ---
  const categoricalCandidates = findCategoricalCandidates(table, structural.columns, quality)
  const filterColumn = chooseFilterColumn(categoricalCandidates)
  const secondaryColumn = filterColumn
    ? chooseSecondaryCategoricalColumn(categoricalCandidates, filterColumn.column)
    : null
  const measureColumn = chooseMeasureColumn(numeric)
  const trendDateColumn = chooseDateColumn(dates)

  const kpis = computeDashboardKpis({
    filteredTable: table,
    totalRowsUnfiltered: structural.stats.totalRows,
    measureColumn,
    secondaryColumn: secondaryColumn?.column ?? null,
  })
  const notices = computeDashboardNotices({
    filteredQuality: quality,
    filteredNumeric: numeric,
    totalRowsInView: table.numRows(),
  })
  const charts = chooseDashboardCharts({
    table,
    dates,
    dateColumn: trendDateColumn,
    filterColumn,
    secondaryColumn,
    measureColumn,
    numeric,
  })

  // --- Data quality (mirrors markdownReport.ts's assembly). ---
  const missingRows: PdfQualityRow[] = quality.missingValues
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count)
    .map((r) => ({
      column: r.affectedColumns[0] ?? 'Unknown',
      count: r.count,
      percentage: r.percentage,
    }))
  const totalMissing = quality.missingValues.reduce((sum, r) => sum + r.count, 0)

  const outlierRows = numeric
    .filter((n) => n.outliers.length > 0)
    .sort((a, b) => b.outliers.length - a.outliers.length)
    .map((n) => ({ column: n.column, count: n.outliers.length }))
  const totalOutliers = outlierRows.reduce((sum, r) => sum + r.count, 0)

  // --- LLM content. ---
  const explanationGroup = asSingleGroup(llmOutputs.explanation)
  const explanationItem = explanationGroup?.items[0] ?? null

  return {
    fileName: file.name,
    generatedAt: Date.now(),
    uploadedAt,
    overview: {
      rows: structural.stats.totalRows,
      columns: structural.stats.totalColumns,
      fileSizeMB: structural.stats.fileSizeMB,
    },
    dashboard: {
      filterColumnLabel: filterColumn?.column ?? null,
      kpis,
      notices,
      charts,
    },
    explanation: explanationItem
      ? { title: explanationItem.title, description: explanationItem.description }
      : null,
    businessInsights: asBusinessInsights(llmOutputs.businessInsights),
    clientQuestions: asSingleGroup(llmOutputs.clientQuestions)?.items ?? null,
    dataDictionary: asSingleGroup(llmOutputs.dataDictionary),
    quality: {
      totalMissing,
      missingRows,
      duplicateCount: quality.duplicateRows.count,
      duplicateDescription: quality.duplicateRows.description,
      totalOutliers,
      outlierRows,
    },
    cleaningSummary: summarizeCleaningTrail(
      cleaningSlot && cleaningSlot.status === 'done' ? cleaningSlot.data : null,
    ),
  }
}

/** Derives a `<basename>-report.pdf` download name from the original dataset file name — mirrors `markdownReport.ts`'s `reportFileName`. */
export function pdfReportFileName(originalFileName: string): string {
  const base = originalFileName.replace(/\.[^./\\]+$/, '')
  return `${base || 'dataset'}-report.pdf`
}
