/**
 * Dashboard metrics — Phase 9, Milestone 9.1. Pure, synchronous helper
 * functions `DashboardPanel` uses to turn the live (filtered-or-not)
 * Arquero table into the dashboard's KPI tiles, notices, and chart data.
 *
 * ## Design decision: client-computed, not LLM-reused
 *
 * The dashboard's KPIs and notices are deliberately computed here, live,
 * from the table — not read from the pipeline's `businessInsights.kpis`
 * (those already live in the top bar, Phase 8 Milestone 8.3, and are a
 * separate, static, dataset-wide thing). Re-running an LLM call on every
 * filter change would violate this project's established "never burn a
 * paid LLM call on a UI interaction" rule (see `NOTES.md`), and would make
 * the dashboard feel slow. Every function below is cheap enough to re-run
 * on every filter change against a dataset this size (roughly a thousand
 * rows) without any perceptible delay.
 *
 * ## Column auto-detection
 *
 * `findCategoricalCandidates` + `chooseFilterColumn` auto-detect a
 * reasonable low-cardinality (2-15 distinct values) string column to drive
 * the dashboard-wide filter, preferring columns with the fewest
 * `analyzeDataQuality`-flagged near-duplicate/inconsistent value groups (so
 * the filter's chip list doesn't show e.g. "WEB" / "Web" / "web" as three
 * separate options) — see `DashboardPanel`'s doc comment for the concrete
 * column this picks on the fixture dataset and why.
 */
import * as aq from 'arquero'
import type { ColumnMetadata } from '../analysis/structural'
import type { DataQualityReport, QualitySeverity } from '../analysis/quality'
import type { NumericColumnAnalysis } from '../analysis/numeric'
import type { DateColumnAnalysis } from '../analysis/dates'

// ---------------------------------------------------------------------------
// Categorical column detection (filter column + secondary "top category" KPI)
// ---------------------------------------------------------------------------

/** Columns with fewer distinct non-empty values than this aren't meaningfully filterable. */
const MIN_CATEGORY_VALUES = 2
/** Columns with more distinct values than this stop being a reasonable chip-select filter (per the roadmap's "2-15" framing). */
const MAX_CATEGORY_VALUES = 15

export interface CategoricalCandidate {
  column: string
  /** Sorted, non-empty distinct values found in the (unfiltered) table. */
  distinctValues: string[]
  /** Sum of `sampleItems.length` across `quality.inconsistentCategoricals` entries affecting this column — lower is "cleaner". */
  messiness: number
}

/** Scans `columns` for string-typed columns whose distinct-value count falls in the "reasonable chip filter" range. */
export function findCategoricalCandidates(
  table: aq.ColumnTable,
  columns: ColumnMetadata[],
  quality: DataQualityReport,
): CategoricalCandidate[] {
  const messMap = new Map<string, number>()
  for (const result of quality.inconsistentCategoricals) {
    for (const col of result.affectedColumns) {
      messMap.set(col, (messMap.get(col) ?? 0) + result.sampleItems.length)
    }
  }

  const candidates: CategoricalCandidate[] = []
  for (const column of columns) {
    if (column.dataType !== 'string') continue
    const distinct = distinctNonEmptyValues(table, column.name)
    if (
      distinct.length < MIN_CATEGORY_VALUES ||
      distinct.length > MAX_CATEGORY_VALUES
    ) {
      continue
    }
    candidates.push({
      column: column.name,
      distinctValues: distinct,
      messiness: messMap.get(column.name) ?? 0,
    })
  }
  return candidates
}

function distinctNonEmptyValues(table: aq.ColumnTable, column: string): string[] {
  const raw = table.array(column) as unknown[]
  const set = new Set<string>()
  for (const value of raw) {
    if (value === null || value === undefined) continue
    const str = String(value).trim()
    if (str !== '') set.add(str)
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b))
}

/** Ranks candidates cleanest-first (fewest flagged inconsistent-value groups), then by distinct-value count (most useful to filter on), descending. */
function rankCandidates(candidates: CategoricalCandidate[]): CategoricalCandidate[] {
  return [...candidates].sort((a, b) => {
    if (a.messiness !== b.messiness) return a.messiness - b.messiness
    return b.distinctValues.length - a.distinctValues.length
  })
}

/** Picks the single best candidate to drive the dashboard-wide filter, or `null` if none qualify. */
export function chooseFilterColumn(
  candidates: CategoricalCandidate[],
): CategoricalCandidate | null {
  const ranked = rankCandidates(candidates)
  return ranked[0] ?? null
}

/** Column names whose business meaning makes them a good "most common X in view" KPI. */
const BUSINESS_NAME_HINTS = /status|channel|category|segment|region|country|type/i

/** Picks a second categorical column (distinct from the filter column) for the "most common X" KPI tile, preferring an obviously business-meaningful name. */
export function chooseSecondaryCategoricalColumn(
  candidates: CategoricalCandidate[],
  excludeColumn: string,
): CategoricalCandidate | null {
  const rest = candidates.filter((c) => c.column !== excludeColumn)
  if (rest.length === 0) return null
  const hinted = rest.filter((c) => BUSINESS_NAME_HINTS.test(c.column))
  const pool = hinted.length > 0 ? hinted : rest
  return rankCandidates(pool)[0] ?? null
}

// ---------------------------------------------------------------------------
// Numeric measure column detection
// ---------------------------------------------------------------------------

/** Name patterns (checked in order) for picking a "headline" numeric measure column, e.g. for a KPI's sum/average. */
const MEASURE_NAME_HINTS = [
  /total/i,
  /amount/i,
  /revenue/i,
  /value/i,
  /price/i,
  /qty|quantity/i,
]

/**
 * Name patterns for numeric columns whose *sum* has no real business
 * meaning, even though the column itself is perfectly valid to analyze
 * other ways (average, distribution). Bug found via live user feedback: a
 * tourism dataset with an `age` column but nothing matching
 * `MEASURE_NAME_HINTS` fell through to "just pick the first numeric
 * column", which happened to be `age`, and the dashboard rendered a "Total
 * age" KPI/chart — a number with zero statistical meaning (summing a
 * per-person attribute across unrelated rows isn't a business metric).
 * Covers per-entity attributes (age, ratings/scores, already-relative
 * figures like percentages/rates/ratios/index values) and identifiers
 * (ids, codes, zip/postal codes, geographic coordinates) — none of these
 * become more meaningful by adding them together.
 */
const NON_SUMMABLE_NAME_HINTS = [
  /\bage\b/i,
  /\byear\b/i,
  /rating/i,
  /\bscore\b/i,
  /\brank\b/i,
  /percent|\bpct\b|%/i,
  /\brate\b/i,
  /\bratio\b/i,
  /\bindex\b/i,
  /\bid\b/i,
  /zip|postal/i,
  /latitude|longitude|\blat\b|\blon\b|\blng\b/i,
]

/**
 * `\b` word-boundary regexes don't treat `_`/`-` as boundaries (they're
 * word characters in JS regex), so `\bid\b` misses a real column named
 * `visitor_id` or `customer-id` — found while manually verifying this
 * fix. Normalizing separators to spaces first makes every `\b`-based hint
 * above (and `MEASURE_NAME_HINTS`) match snake_case/kebab-case column
 * names the same way it already matches plain ones.
 */
function normalizeColumnNameForMatching(column: string): string {
  return column.replace(/[_-]+/g, ' ')
}

/**
 * Picks the numeric column most likely to be a meaningful business measure
 * to *sum* (e.g. for a KPI's total or a value-weighted chart). Falls back
 * to the first numeric column whose name doesn't match a known
 * non-summable pattern — never blindly to "just the first numeric column",
 * since that column could be something like `age` where a sum is
 * statistically meaningless. Returns `null` (not a bad guess) when every
 * numeric column looks non-summable — callers already treat `null` as "no
 * measure column available" and fall back to row counts or a distribution
 * histogram instead, both of which remain valid for a column like `age`.
 */
export function chooseMeasureColumn(
  numeric: NumericColumnAnalysis[],
): string | null {
  if (numeric.length === 0) return null
  for (const hint of MEASURE_NAME_HINTS) {
    const match = numeric.find((n) => hint.test(normalizeColumnNameForMatching(n.column)))
    if (match) return match.column
  }
  const summable = numeric.filter(
    (n) =>
      !NON_SUMMABLE_NAME_HINTS.some((hint) =>
        hint.test(normalizeColumnNameForMatching(n.column)),
      ),
  )
  return summable[0]?.column ?? null
}

// ---------------------------------------------------------------------------
// Date column detection (for the trend chart)
// ---------------------------------------------------------------------------

const DATE_NAME_HINTS = [/order/i, /created/i, /placed/i, /date/i]

/** Picks the date column most likely to represent "when this row happened" for the trend chart, falling back to the first detected date column. */
export function chooseDateColumn(dates: DateColumnAnalysis[]): string | null {
  if (dates.length === 0) return null
  for (const hint of DATE_NAME_HINTS) {
    const match = dates.find((d) => hint.test(d.column))
    if (match) return match.column
  }
  return dates[0].column
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

/** Filters `table` to rows whose `column` value (trimmed) equals `value`, or returns `table` unchanged when `value` is `null` ("All"). */
export function filterTableByCategory(
  table: aq.ColumnTable,
  column: string,
  value: string | null,
): aq.ColumnTable {
  if (value === null) return table
  return table.filter(
    aq.escape((d: Record<string, unknown>) => {
      const raw = d[column]
      if (raw === null || raw === undefined) return false
      return String(raw).trim() === value
    }),
  )
}

// ---------------------------------------------------------------------------
// KPIs
// ---------------------------------------------------------------------------

export interface DashboardKpi {
  id: string
  label: string
  value: string
  caption: string
}

function formatNumber(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function sumAndMean(
  table: aq.ColumnTable,
  column: string,
): { sum: number; mean: number; count: number } {
  const values = table.array(column) as unknown[]
  let sum = 0
  let count = 0
  for (const value of values) {
    const n = coerceToNumber(value)
    if (n !== null) {
      sum += n
      count++
    }
  }
  return { sum, mean: count > 0 ? sum / count : 0, count }
}

function topCategoryValue(
  table: aq.ColumnTable,
  column: string,
): { value: string; count: number } | null {
  const values = table.array(column) as unknown[]
  const counts = new Map<string, number>()
  for (const value of values) {
    if (value === null || value === undefined) continue
    const str = String(value).trim()
    if (str === '') continue
    counts.set(str, (counts.get(str) ?? 0) + 1)
  }
  let best: { value: string; count: number } | null = null
  for (const [value, count] of counts) {
    if (!best || count > best.count) best = { value, count }
  }
  return best
}

/** Computes the client-side KPI strip for the (already filtered) table. Every value is recomputed for real on every call — no caching, no LLM. */
export function computeDashboardKpis(opts: {
  filteredTable: aq.ColumnTable
  totalRowsUnfiltered: number
  measureColumn: string | null
  secondaryColumn: string | null
}): DashboardKpi[] {
  const { filteredTable, totalRowsUnfiltered, measureColumn, secondaryColumn } = opts
  const rows = filteredTable.numRows()

  const kpis: DashboardKpi[] = [
    {
      id: 'rows-in-view',
      label: 'Rows in view',
      value: rows.toLocaleString(),
      caption:
        totalRowsUnfiltered > 0
          ? `${((rows / totalRowsUnfiltered) * 100).toFixed(1)}% of ${totalRowsUnfiltered.toLocaleString()} total rows`
          : 'No rows in dataset.',
    },
  ]

  if (measureColumn) {
    const { sum, mean, count } = sumAndMean(filteredTable, measureColumn)
    kpis.push({
      id: 'measure-total',
      label: `Total ${measureColumn}`,
      value: count > 0 ? formatNumber(sum) : '—',
      caption:
        count > 0
          ? `Summed across ${count.toLocaleString()} value(s) in view`
          : 'No numeric values in view.',
    })
    kpis.push({
      id: 'measure-average',
      label: `Average ${measureColumn}`,
      value: count > 0 ? formatNumber(mean) : '—',
      caption: 'Per row, this view',
    })
  }

  if (secondaryColumn) {
    const top = topCategoryValue(filteredTable, secondaryColumn)
    kpis.push({
      id: 'top-category',
      label: `Most common ${secondaryColumn}`,
      value: top ? top.value : '—',
      caption: top
        ? `${top.count.toLocaleString()} of ${rows.toLocaleString()} row(s) (${((top.count / Math.max(rows, 1)) * 100).toFixed(1)}%)`
        : 'No data in view.',
    })
  }

  return kpis
}

// ---------------------------------------------------------------------------
// Notices
// ---------------------------------------------------------------------------

export interface DashboardNotice {
  id: string
  severity: QualitySeverity
  text: string
}

/** Max notices shown, most-severe-first, per the milestone's "2-4 notices" framing. */
const MAX_NOTICES = 4
const SEVERITY_RANK: Record<QualitySeverity, number> = { error: 0, warning: 1, info: 2 }

/**
 * Derives 2-4 short, business-language notices from the (already filtered)
 * table's re-run Phase 3 data-quality/numeric analysis. Every notice here is
 * computed for real against the current filter — nothing is reused from a
 * prior LLM call.
 */
export function computeDashboardNotices(opts: {
  filteredQuality: DataQualityReport
  filteredNumeric: NumericColumnAnalysis[]
  totalRowsInView: number
}): DashboardNotice[] {
  const { filteredQuality, filteredNumeric, totalRowsInView } = opts

  if (totalRowsInView === 0) {
    return [{ id: 'no-rows', severity: 'warning', text: 'No rows match this filter.' }]
  }

  const notices: DashboardNotice[] = []

  const missing = filteredQuality.missingValues
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count)
  for (const m of missing.slice(0, 2)) {
    const columnName = m.affectedColumns[0] ?? 'a column'
    notices.push({
      id: `missing-${columnName}`,
      severity: m.severity,
      text: `${m.count.toLocaleString()} row(s) in this view are missing "${columnName}" (${m.percentage.toFixed(1)}%).`,
    })
  }

  if (filteredQuality.duplicateRows.count > 0) {
    notices.push({
      id: 'duplicates',
      severity: filteredQuality.duplicateRows.severity,
      text: `${filteredQuality.duplicateRows.count.toLocaleString()} duplicate row(s) found in this view.`,
    })
  }

  const withOutliers = [...filteredNumeric]
    .filter((n) => n.outliers.length > 0)
    .sort((a, b) => b.outliers.length - a.outliers.length)
  for (const n of withOutliers.slice(0, 2)) {
    notices.push({
      id: `outliers-${n.column}`,
      severity: 'warning',
      text: `${n.outliers.length.toLocaleString()} outlier value(s) found in "${n.column}" in this view.`,
    })
  }

  for (const c of filteredQuality.inconsistentCategoricals.slice(0, 1)) {
    notices.push({
      id: `inconsistent-${c.affectedColumns[0] ?? c.checkName}`,
      severity: c.severity,
      text: c.description,
    })
  }

  if (notices.length === 0) {
    return [
      {
        id: 'clean',
        severity: 'info',
        text: 'No data quality issues detected in this view.',
      },
    ]
  }

  return notices
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
    .slice(0, MAX_NOTICES)
}

// ---------------------------------------------------------------------------
// Chart data
// ---------------------------------------------------------------------------

export interface CategoryBreakdownPoint {
  name: string
  count: number
}

/** Bar-chart slots before flagged values fold into a single "Other" bucket. */
const MAX_BREAKDOWN_SLICES = 6

/** Value counts for `column` in `table`, sorted descending, folding anything beyond the top slices into "Other". Blank/missing values are grouped under "(missing)" rather than dropped. */
export function computeCategoryBreakdown(
  table: aq.ColumnTable,
  column: string,
): CategoryBreakdownPoint[] {
  const values = table.array(column) as unknown[]
  const counts = new Map<string, number>()
  for (const value of values) {
    const str = value === null || value === undefined ? '' : String(value).trim()
    const label = str === '' ? '(missing)' : str
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }

  const sorted = Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)

  if (sorted.length <= MAX_BREAKDOWN_SLICES) return sorted

  const top = sorted.slice(0, MAX_BREAKDOWN_SLICES - 1)
  const otherCount = sorted
    .slice(MAX_BREAKDOWN_SLICES - 1)
    .reduce((sum, entry) => sum + entry.count, 0)
  return [...top, { name: 'Other', count: otherCount }]
}

export interface TrendPoint {
  bucket: string
  count: number
}

/** Row counts per calendar month (`YYYY-MM`), sorted chronologically, for `dateColumn`'s already-normalized values. */
export function computeTrendData(
  dates: DateColumnAnalysis[],
  dateColumn: string,
): TrendPoint[] {
  const column = dates.find((d) => d.column === dateColumn)
  if (!column) return []

  const buckets = new Map<string, number>()
  for (const normalized of column.normalizedValues) {
    if (!normalized) continue
    const bucket = normalized.slice(0, 7) // YYYY-MM
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1)
  }

  return Array.from(buckets.entries())
    .map(([bucket, count]) => ({ bucket, count }))
    .sort((a, b) => a.bucket.localeCompare(b.bucket))
}

/** Coerces a raw table cell to a finite number, or `null` if it isn't one — same coercion `sumAndMean` uses, duplicated here since both need it independently and neither depends on the other. */
function coerceToNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  // `Number('')` is `0`, not `NaN` — without this guard, a blank/missing
  // string cell would silently coerce to a real zero instead of being
  // excluded, corrupting any sum/bucket it landed in.
  if (trimmed === '') return null
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : null
}

/**
 * Sum of `measureColumn`'s values per distinct value of `categoryColumn`,
 * row-aligned via `table.array` (Arquero preserves row order, so the two
 * arrays line up by index without a join). Rows whose measure value doesn't
 * coerce to a finite number are excluded from the sum entirely (not counted
 * as zero), matching `sumAndMean`'s KPI coercion. Same top-slices-plus-
 * "Other" folding as `computeCategoryBreakdown`, so a real business figure
 * (e.g. total revenue) can drive the same chart shape a plain row count
 * would, when a measure column is available — "Total revenue by region" is
 * a materially more useful chart than "row count by region."
 */
export function computeCategoryMeasureBreakdown(
  table: aq.ColumnTable,
  categoryColumn: string,
  measureColumn: string,
): CategoryBreakdownPoint[] {
  const categories = table.array(categoryColumn) as unknown[]
  const measures = table.array(measureColumn) as unknown[]

  const sums = new Map<string, number>()
  for (let i = 0; i < categories.length; i++) {
    const n = coerceToNumber(measures[i])
    if (n === null) continue
    const raw = categories[i]
    const label =
      raw === null || raw === undefined || String(raw).trim() === ''
        ? '(missing)'
        : String(raw).trim()
    sums.set(label, (sums.get(label) ?? 0) + n)
  }

  const sorted = Array.from(sums.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)

  if (sorted.length <= MAX_BREAKDOWN_SLICES) return sorted

  const top = sorted.slice(0, MAX_BREAKDOWN_SLICES - 1)
  const otherSum = sorted
    .slice(MAX_BREAKDOWN_SLICES - 1)
    .reduce((sum, entry) => sum + entry.count, 0)
  return [...top, { name: 'Other', count: otherSum }]
}

/** Number of equal-width bins a numeric distribution chart splits its range into. */
const NUMERIC_DISTRIBUTION_BUCKETS = 6

function formatBucketBound(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 1 })
}

/**
 * Buckets `column`'s numeric values into up to `NUMERIC_DISTRIBUTION_BUCKETS`
 * equal-width bins between its observed min and max, returning one point per
 * bucket (range label, count of values falling in it) — a histogram. This is
 * the dashboard's chart of last resort: unlike a trend chart (needs a date
 * column) or a breakdown chart (needs a low-cardinality categorical column),
 * this only needs *any* numeric column, so a dataset with neither dates nor
 * meaningfully-categorical columns (e.g. a table of pure measurements) still
 * gets a real, non-blank chart instead of an empty "nothing detected" panel.
 * Returns `[]` for a column with no coercible numeric values; a single-point
 * result (one bucket, all values) when every value is identical.
 */
export function computeNumericDistribution(
  table: aq.ColumnTable,
  column: string,
): CategoryBreakdownPoint[] {
  const raw = table.array(column) as unknown[]
  const values: number[] = []
  for (const value of raw) {
    const n = coerceToNumber(value)
    if (n !== null) values.push(n)
  }
  if (values.length === 0) return []

  const min = Math.min(...values)
  const max = Math.max(...values)
  if (min === max) {
    return [{ name: formatBucketBound(min), count: values.length }]
  }

  const bucketWidth = (max - min) / NUMERIC_DISTRIBUTION_BUCKETS
  const counts = new Array<number>(NUMERIC_DISTRIBUTION_BUCKETS).fill(0)
  for (const value of values) {
    const index = Math.min(
      NUMERIC_DISTRIBUTION_BUCKETS - 1,
      Math.floor((value - min) / bucketWidth),
    )
    counts[index]++
  }

  return counts.map((count, index) => {
    const bucketMin = min + index * bucketWidth
    const bucketMax =
      index === NUMERIC_DISTRIBUTION_BUCKETS - 1 ? max : bucketMin + bucketWidth
    return {
      name: `${formatBucketBound(bucketMin)}–${formatBucketBound(bucketMax)}`,
      count,
    }
  })
}

// ---------------------------------------------------------------------------
// Adaptive chart selection
// ---------------------------------------------------------------------------

/** Which Recharts component a `DashboardChartSpec` renders as. */
export type DashboardChartKind = 'trend' | 'bar'

interface DashboardChartSpecBase {
  id: string
  title: string
  /** Y-axis/tooltip label for this chart's value — "Rows" for a plain count, or "Total <measure column>" when value-weighted by a real measure. */
  valueLabel: string
}

/** A monthly trend line — `kind: 'trend'` and `TrendPoint[]` data are tied together so a `kind` check narrows `data`'s type, not just its runtime shape. */
export interface DashboardTrendChartSpec extends DashboardChartSpecBase {
  kind: 'trend'
  data: TrendPoint[]
}

/** A category bar chart (breakdown or numeric-distribution histogram) — same `kind`/`data` pairing as `DashboardTrendChartSpec`. */
export interface DashboardBarChartSpec extends DashboardChartSpecBase {
  kind: 'bar'
  data: CategoryBreakdownPoint[]
}

/** One chart the dashboard actually has real data for — title, axis/tooltip value label, and the data itself, all already resolved so the display component never has to re-derive "is this chart even possible" logic. A discriminated union on `kind` so a `chart.kind === 'trend'` check narrows `chart.data` to the right shape. */
export type DashboardChartSpec = DashboardTrendChartSpec | DashboardBarChartSpec

/** Default number of chart cards the dashboard shows — matches the existing 2-column chart grid; kept configurable rather than hardcoded in case that grid ever grows. */
const DEFAULT_MAX_CHARTS = 2

/**
 * Picks which charts the dashboard actually shows, adapting to whatever
 * columns this specific dataset has rather than assuming a fixed "trend
 * chart + breakdown chart" shape always applies. Found in live testing: a
 * dataset with no detected date column left the trend-chart slot
 * permanently blank ("No date column detected...") even though the dataset
 * had plenty of other chartable columns — the two chart slots were
 * hardcoded to specific chart types instead of picking from what's actually
 * available.
 *
 * Candidates are considered in priority order and only included if they
 * produce real, non-empty data — never invented, never a placeholder:
 *  1. Trend over time (needs a detected date column).
 *  2. Breakdown by the dashboard's primary filter column, value-weighted by
 *     the measure column when one exists ("Total revenue by region" is more
 *     useful than "row count by region"), falling back to row counts
 *     otherwise.
 *  3. Breakdown by the secondary categorical column, same value logic —
 *     only when it's a genuinely different column from the primary one.
 *  4. A numeric distribution (histogram) of the measure column (or, absent
 *     one, the first numeric column) — the chart of last resort, since it
 *     only needs *any* numeric column to exist, not a date or a
 *     low-cardinality categorical one.
 *
 * Returns the first `maxCharts` candidates that actually produced data —
 * for a dataset shaped like the fixture (dates + categoricals + a measure
 * column), that's still exactly the original trend + breakdown pair; for a
 * dataset missing dates, categoricals 2-3 or the histogram fill in instead
 * of leaving a slot empty.
 */
export function chooseDashboardCharts(opts: {
  table: aq.ColumnTable
  dates: DateColumnAnalysis[]
  dateColumn: string | null
  filterColumn: CategoricalCandidate | null
  secondaryColumn: CategoricalCandidate | null
  measureColumn: string | null
  numeric: NumericColumnAnalysis[]
  maxCharts?: number
}): DashboardChartSpec[] {
  const {
    table,
    dates,
    dateColumn,
    filterColumn,
    secondaryColumn,
    measureColumn,
    numeric,
  } = opts
  const maxCharts = opts.maxCharts ?? DEFAULT_MAX_CHARTS
  const specs: DashboardChartSpec[] = []

  if (dateColumn) {
    const trendData = computeTrendData(dates, dateColumn)
    if (trendData.length > 0) {
      specs.push({
        id: 'trend',
        kind: 'trend',
        title: `Orders over time (by ${dateColumn}, monthly)`,
        valueLabel: 'Rows',
        data: trendData,
      })
    }
  }

  const breakdownCandidates = [filterColumn, secondaryColumn].filter(
    (candidate): candidate is CategoricalCandidate => candidate !== null,
  )
  for (const candidate of breakdownCandidates) {
    const data = measureColumn
      ? computeCategoryMeasureBreakdown(table, candidate.column, measureColumn)
      : computeCategoryBreakdown(table, candidate.column)
    if (data.length === 0) continue
    specs.push({
      id: `breakdown-${candidate.column}`,
      kind: 'bar',
      title: measureColumn
        ? `Total ${measureColumn} by ${candidate.column}`
        : `Breakdown by ${candidate.column}`,
      valueLabel: measureColumn ? `Total ${measureColumn}` : 'Rows',
      data,
    })
  }

  const distributionColumn = measureColumn ?? numeric[0]?.column ?? null
  if (distributionColumn) {
    const data = computeNumericDistribution(table, distributionColumn)
    if (data.length > 0) {
      specs.push({
        id: `distribution-${distributionColumn}`,
        kind: 'bar',
        title: `Distribution of ${distributionColumn}`,
        valueLabel: 'Rows',
        data,
      })
    }
  }

  return specs.slice(0, maxCharts)
}
