/**
 * Analysis summary for LLM context — Phase 4, Milestone 4.3 ("Prepare
 * analysis summary for LLM context"). Condenses Phase 3's full analysis
 * output (`src/lib/analysis/{structural,numeric,quality,dates}.ts`) into a
 * compact, prompt-friendly structure: column descriptions, data quality
 * issues, and statistical highlights. This module never re-derives
 * statistics itself — it only calls the Phase 3 analysis functions and
 * summarizes/condenses their already-computed results, since re-deriving
 * stats would duplicate logic Phase 3 already owns (and risk drifting from
 * it).
 *
 * `buildAnalysisSummary` is the single entry point: given an Arquero
 * `ColumnTable` and the originating `File`, it runs all four Phase 3
 * analyzers and produces a `DatasetAnalysisSummary` sized to stay
 * LLM-digestible even on wide datasets — e.g. it keeps only the top few
 * highlights per column, not every quality-check result or every raw
 * outlier.
 */
import * as aq from 'arquero'
import { analyzeStructure, type ColumnDataType } from '../analysis/structural'
import { analyzeNumericColumns } from '../analysis/numeric'
import {
  analyzeDataQuality,
  type QualityCheckResult,
  type QualitySeverity,
} from '../analysis/quality'
import { analyzeDateColumns } from '../analysis/dates'

/** Condensed description of a single column, for prompt context. */
export interface ColumnSummary {
  name: string
  dataType: ColumnDataType
  /** A few representative sample values, stringified for JSON-friendliness. */
  sampleValues: string[]
}

/** A condensed, human-readable data-quality finding worth surfacing to the LLM. */
export interface QualityHighlight {
  checkName: string
  description: string
  severity: QualitySeverity
  affectedColumns: string[]
}

/** A condensed statistical highlight for one numeric column. */
export interface NumericHighlight {
  column: string
  min: number
  max: number
  mean: number
  median: number
  standardDeviation: number
  outlierCount: number
}

/** A condensed date-range highlight for one date column. */
export interface DateHighlight {
  column: string
  minDate: string
  maxDate: string
  durationDays: number
  flaggedDateCount: number
}

/** The full condensed summary handed to the business-insights prompt as context. */
export interface DatasetAnalysisSummary {
  totalRows: number
  totalColumns: number
  fileSizeMB: number
  columns: ColumnSummary[]
  qualityHighlights: QualityHighlight[]
  numericHighlights: NumericHighlight[]
  dateHighlights: DateHighlight[]
}

/** Max quality findings kept in the summary, ranked by severity (errors first). */
const MAX_QUALITY_HIGHLIGHTS = 10

/** Max sample values kept per column in the summary. */
const MAX_SAMPLE_VALUES_PER_COLUMN = 3

const SEVERITY_RANK: Record<QualitySeverity, number> = {
  error: 0,
  warning: 1,
  info: 2,
}

/**
 * Runs Phase 3's full analysis pipeline (`analyzeStructure` ->
 * `analyzeNumericColumns` / `analyzeDataQuality` / `analyzeDateColumns`) and
 * condenses the results into a compact `DatasetAnalysisSummary` suitable for
 * injecting into an LLM prompt via `formatDatasetContext` (`prompt.ts`).
 */
export function buildAnalysisSummary(
  table: aq.ColumnTable,
  file: File,
): DatasetAnalysisSummary {
  const structural = analyzeStructure(table, file)
  const numeric = analyzeNumericColumns(table, structural.columns)
  const quality = analyzeDataQuality(table, structural.columns)
  const dates = analyzeDateColumns(table, structural.columns)

  const columns: ColumnSummary[] = structural.columns.map((column) => ({
    name: column.name,
    dataType: column.dataType,
    sampleValues: column.sampleValues
      .slice(0, MAX_SAMPLE_VALUES_PER_COLUMN)
      .map((value) => String(value)),
  }))

  const qualityHighlights = summarizeQualityHighlights(quality)

  // `analyzeNumericColumns` already restricts its results to numeric
  // columns, so no further filtering is needed here.
  const numericHighlights: NumericHighlight[] = numeric.map((col) => ({
    column: col.column,
    min: col.min,
    max: col.max,
    mean: col.mean,
    median: col.median,
    standardDeviation: col.standardDeviation,
    outlierCount: col.outliers.length,
  }))

  const dateHighlights: DateHighlight[] = dates.map((col) => ({
    column: col.column,
    minDate: col.minDate,
    maxDate: col.maxDate,
    durationDays: col.durationDays,
    flaggedDateCount: col.flaggedDates.length,
  }))

  return {
    totalRows: structural.stats.totalRows,
    totalColumns: structural.stats.totalColumns,
    fileSizeMB: structural.stats.fileSizeMB,
    columns,
    qualityHighlights,
    numericHighlights,
    dateHighlights,
  }
}

/**
 * Flattens `analyzeDataQuality`'s four result buckets into one ranked list,
 * keeping only genuinely noteworthy findings (non-zero missing values,
 * duplicates, or flagged columns) and capping the total at
 * `MAX_QUALITY_HIGHLIGHTS`, worst severity first, so a wide dataset doesn't
 * dump dozens of "no issues" entries into the prompt.
 *
 * Exported so Milestone 10.1's `generateCleaningPlan` (`cleaningPlan.ts`) can
 * reuse the exact same condensing logic for its raw-table pre-clean scan
 * instead of re-deriving it.
 */
export function summarizeQualityHighlights(
  quality: ReturnType<typeof analyzeDataQuality>,
): QualityHighlight[] {
  const all: QualityCheckResult[] = [
    ...quality.missingValues.filter((r) => r.count > 0),
    quality.duplicateRows.count > 0 ? quality.duplicateRows : null,
    ...quality.inconsistentCategoricals,
    ...quality.mixedTypes,
  ].filter((r): r is QualityCheckResult => r !== null)

  return all
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
    .slice(0, MAX_QUALITY_HIGHLIGHTS)
    .map((r) => ({
      checkName: r.checkName,
      description: r.description,
      severity: r.severity,
      affectedColumns: r.affectedColumns,
    }))
}
