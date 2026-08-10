import type {
  DataQualityReport,
  QualitySeverity,
} from '../../lib/analysis/quality'
import type { NumericColumnAnalysis } from '../../lib/analysis/numeric'

interface DataQualitySummaryCardProps {
  /** Phase 3, Milestone 3.3 data-quality report — severities are already computed there, not re-derived here. */
  quality: DataQualityReport
  /** Phase 3, Milestone 3.2 numeric column analysis — outlier counts are already computed there, not re-derived here. */
  numeric: NumericColumnAnalysis[]
  /** Total data rows, used only to express outlier counts as a percentage for severity. */
  totalRows: number
}

const SEVERITY_BADGE_STYLES: Record<QualitySeverity, string> = {
  info: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  warning: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  error: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
}

const SEVERITY_LABEL: Record<QualitySeverity, string> = {
  info: 'OK',
  warning: 'Warning',
  error: 'Issue',
}

/** Outlier-count severity thresholds, expressed as a share of a column's total rows. Mirrors the qualitative info/warning/error bands quality.ts uses for its own checks. */
const OUTLIER_WARNING_THRESHOLD = 1
const OUTLIER_ERROR_THRESHOLD = 5

function outlierSeverity(
  outlierCount: number,
  totalRows: number,
): QualitySeverity {
  if (outlierCount === 0) return 'info'
  const percentage = totalRows === 0 ? 0 : (outlierCount / totalRows) * 100
  if (percentage >= OUTLIER_ERROR_THRESHOLD) return 'error'
  if (percentage >= OUTLIER_WARNING_THRESHOLD) return 'warning'
  return 'info'
}

/**
 * Phase 5, Milestone 5.1 "data quality summary component": a visual summary
 * of missing-value counts, duplicate counts, and outlier counts with
 * severity indicators. Every number and severity here is read directly from
 * Phase 3's already-computed results (`DataQualityReport`,
 * `NumericColumnAnalysis[]`) — nothing is re-derived.
 */
export function DataQualitySummaryCard({
  quality,
  numeric,
  totalRows,
}: DataQualitySummaryCardProps) {
  const columnsWithMissing = quality.missingValues
    .filter((result) => result.count > 0)
    .sort((a, b) => b.count - a.count)

  const totalMissing = quality.missingValues.reduce(
    (sum, result) => sum + result.count,
    0,
  )

  const columnsWithOutliers = numeric
    .map((column) => ({
      column: column.column,
      count: column.outliers.length,
      severity: outlierSeverity(column.outliers.length, totalRows),
    }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count)

  const totalOutliers = columnsWithOutliers.reduce(
    (sum, entry) => sum + entry.count,
    0,
  )

  return (
    <section
      aria-labelledby="data-quality-heading"
      className="flex flex-col gap-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 dark:border-slate-800 dark:bg-slate-900"
    >
      <div>
        <h2
          id="data-quality-heading"
          className="text-lg font-semibold text-slate-900 dark:text-slate-100"
        >
          Data quality summary
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Missing values, duplicate rows, and statistical outliers remaining
          after automated cleaning. See "How issues were managed" below for
          what was already fixed.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryTile
          label="Missing values"
          count={totalMissing}
          severity={
            columnsWithMissing.length === 0
              ? 'info'
              : mostSevere(columnsWithMissing.map((r) => r.severity))
          }
          detail={
            columnsWithMissing.length === 0
              ? 'No missing values found.'
              : `Across ${columnsWithMissing.length} column${columnsWithMissing.length === 1 ? '' : 's'}.`
          }
        />
        <SummaryTile
          label="Duplicate rows"
          count={quality.duplicateRows.count}
          severity={quality.duplicateRows.severity}
          detail={quality.duplicateRows.description}
        />
        <SummaryTile
          label="Outliers"
          count={totalOutliers}
          severity={
            columnsWithOutliers.length === 0
              ? 'info'
              : mostSevere(columnsWithOutliers.map((c) => c.severity))
          }
          detail={
            columnsWithOutliers.length === 0
              ? 'No IQR outliers found.'
              : `Across ${columnsWithOutliers.length} numeric column${columnsWithOutliers.length === 1 ? '' : 's'}.`
          }
        />
      </div>

      {columnsWithMissing.length > 0 && (
        <QualityBreakdownList
          title="Missing values by column"
          rows={columnsWithMissing.map((result) => ({
            key: result.affectedColumns[0] ?? result.checkName,
            label: result.affectedColumns[0] ?? 'Unknown column',
            count: result.count,
            percentage: result.percentage,
            severity: result.severity,
          }))}
        />
      )}

      {columnsWithOutliers.length > 0 && (
        <QualityBreakdownList
          title="Outliers by column"
          rows={columnsWithOutliers.map((entry) => ({
            key: entry.column,
            label: entry.column,
            count: entry.count,
            percentage: totalRows === 0 ? 0 : (entry.count / totalRows) * 100,
            severity: entry.severity,
          }))}
        />
      )}
    </section>
  )
}

function mostSevere(severities: QualitySeverity[]): QualitySeverity {
  if (severities.includes('error')) return 'error'
  if (severities.includes('warning')) return 'warning'
  return 'info'
}

interface SummaryTileProps {
  label: string
  count: number
  severity: QualitySeverity
  detail: string
}

function SummaryTile({ label, count, severity, detail }: SummaryTileProps) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/50">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
          {label}
        </span>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${SEVERITY_BADGE_STYLES[severity]}`}
        >
          {SEVERITY_LABEL[severity]}
        </span>
      </div>
      <span className="text-2xl font-bold text-slate-900 dark:text-slate-100">
        {count.toLocaleString()}
      </span>
      <span className="text-xs text-slate-600 dark:text-slate-400">
        {detail}
      </span>
    </div>
  )
}

interface QualityBreakdownRow {
  key: string
  label: string
  count: number
  percentage: number
  severity: QualitySeverity
}

function QualityBreakdownList({
  title,
  rows,
}: {
  title: string
  rows: QualityBreakdownRow[]
}) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
        {title}
      </h3>
      <ul className="flex flex-col divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
        {rows.map((row) => (
          <li
            key={row.key}
            className="flex items-center justify-between gap-3 bg-white px-3 py-2 text-sm dark:bg-slate-900"
          >
            <span className="truncate font-mono text-slate-800 dark:text-slate-200">
              {row.label}
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="text-slate-600 dark:text-slate-400">
                {row.count.toLocaleString()} ({row.percentage.toFixed(1)}%)
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${SEVERITY_BADGE_STYLES[row.severity]}`}
              >
                {SEVERITY_LABEL[row.severity]}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
