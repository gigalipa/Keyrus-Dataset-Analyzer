import { useState, type ReactNode } from 'react'
import type {
  ColumnMetadata,
  StructuralAnalysis,
} from '../../lib/analysis/structural'
import { isNumericDataType } from '../../lib/analysis/structural'
import type { NumericColumnAnalysis } from '../../lib/analysis/numeric'
import type { DateColumnAnalysis } from '../../lib/analysis/dates'
import type {
  DataQualityReport,
  QualityCheckResult,
} from '../../lib/analysis/quality'

interface ColumnDetailViewProps {
  /** Phase 3, Milestone 3.1 — per-column metadata (name, index, type, samples). */
  structural: StructuralAnalysis
  /** Phase 3, Milestone 3.2 — numeric stats/outliers, one entry per numeric column. */
  numeric: NumericColumnAnalysis[]
  /** Phase 3, Milestone 3.4 — date range/format analysis, one entry per detected date column. */
  dates: DateColumnAnalysis[]
  /** Phase 3, Milestone 3.3 — quality checks, used to surface issues that named this column. */
  quality: DataQualityReport
}

/**
 * Phase 5, Milestone 5.1 "column detail view": a column list where clicking
 * a row expands an inline detail panel with every real statistic, sample
 * value, and quality issue Phase 3 computed for that column — no stub data.
 */
export function ColumnDetailView({
  structural,
  numeric,
  dates,
  quality,
}: ColumnDetailViewProps) {
  const [expandedColumn, setExpandedColumn] = useState<string | null>(
    structural.columns[0]?.name ?? null,
  )

  const numericByColumn = new Map(numeric.map((n) => [n.column, n]))
  const dateByColumn = new Map(dates.map((d) => [d.column, d]))

  if (structural.columns.length === 0) {
    return (
      <section
        aria-labelledby="column-detail-heading"
        className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 dark:border-slate-800 dark:bg-slate-900"
      >
        <h2
          id="column-detail-heading"
          className="text-lg font-semibold text-slate-900 dark:text-slate-100"
        >
          Column detail
        </h2>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          No columns to inspect.
        </p>
      </section>
    )
  }

  return (
    <section
      aria-labelledby="column-detail-heading"
      className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 dark:border-slate-800 dark:bg-slate-900"
    >
      <div>
        <h2
          id="column-detail-heading"
          className="text-lg font-semibold text-slate-900 dark:text-slate-100"
        >
          Column detail
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Click a column to see its statistics, sample values, and quality
          issues.
        </p>
      </div>

      <ul className="flex flex-col divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
        {structural.columns.map((column) => {
          const isExpanded = expandedColumn === column.name
          const columnIssues = collectColumnIssues(quality, column.name)

          return (
            <li key={column.name} className="bg-white dark:bg-slate-900">
              <button
                type="button"
                onClick={() =>
                  setExpandedColumn(isExpanded ? null : column.name)
                }
                aria-expanded={isExpanded}
                className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800/60"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden="true"
                    className={`shrink-0 text-slate-400 transition-transform dark:text-slate-500 ${isExpanded ? 'rotate-90' : ''}`}
                  >
                    &#9656;
                  </span>
                  <span className="truncate font-mono font-medium text-slate-800 dark:text-slate-200">
                    {column.name}
                  </span>
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                    {column.dataType}
                  </span>
                </span>
                {columnIssues.length > 0 && (
                  <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                    {columnIssues.length} issue
                    {columnIssues.length === 1 ? '' : 's'}
                  </span>
                )}
              </button>

              {isExpanded && (
                <div className="border-t border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-800/40">
                  <ColumnDetailPanel
                    column={column}
                    numericAnalysis={numericByColumn.get(column.name) ?? null}
                    dateAnalysis={dateByColumn.get(column.name) ?? null}
                    issues={columnIssues}
                  />
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** Every quality-check result (across all four checks) that names this column in `affectedColumns`. */
function collectColumnIssues(
  quality: DataQualityReport,
  columnName: string,
): QualityCheckResult[] {
  const issues: QualityCheckResult[] = []

  const missing = quality.missingValues.find(
    (r) => r.affectedColumns.includes(columnName) && r.count > 0,
  )
  if (missing) issues.push(missing)

  for (const result of quality.inconsistentCategoricals) {
    if (result.affectedColumns.includes(columnName)) issues.push(result)
  }
  for (const result of quality.mixedTypes) {
    if (result.affectedColumns.includes(columnName)) issues.push(result)
  }

  return issues
}

interface ColumnDetailPanelProps {
  column: ColumnMetadata
  numericAnalysis: NumericColumnAnalysis | null
  dateAnalysis: DateColumnAnalysis | null
  issues: QualityCheckResult[]
}

function ColumnDetailPanel({
  column,
  numericAnalysis,
  dateAnalysis,
  issues,
}: ColumnDetailPanelProps) {
  return (
    <div className="flex flex-col gap-4">
      <DetailSection title="Sample values">
        {column.sampleValues.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No non-empty sample values found.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {column.sampleValues.map((value, index) => (
              <span
                key={index}
                className="rounded bg-white px-1.5 py-0.5 font-mono text-xs text-slate-700 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700"
              >
                {String(value)}
              </span>
            ))}
          </div>
        )}
      </DetailSection>

      {isNumericDataType(column.dataType) && numericAnalysis && (
        <DetailSection title="Numeric statistics">
          <StatGrid
            stats={[
              ['Min', formatNumber(numericAnalysis.min)],
              ['Max', formatNumber(numericAnalysis.max)],
              ['Mean', formatNumber(numericAnalysis.mean)],
              ['Median', formatNumber(numericAnalysis.median)],
              ['Mode', formatNumber(numericAnalysis.mode)],
              ['Std dev', formatNumber(numericAnalysis.standardDeviation)],
              ['Q1', formatNumber(numericAnalysis.q1)],
              ['Q3', formatNumber(numericAnalysis.q3)],
              [
                'Outlier bounds',
                `[${formatNumber(numericAnalysis.outlierBounds.lower)}, ${formatNumber(numericAnalysis.outlierBounds.upper)}]`,
              ],
              [
                'Outliers found',
                numericAnalysis.outliers.length.toLocaleString(),
              ],
            ]}
          />
        </DetailSection>
      )}

      {dateAnalysis && (
        <DetailSection title="Date range">
          <StatGrid
            stats={[
              ['Earliest', dateAnalysis.minDate],
              ['Latest', dateAnalysis.maxDate],
              [
                'Duration',
                `${dateAnalysis.durationDays.toLocaleString()} days`,
              ],
              [
                'Detected formats',
                dateAnalysis.detectedFormats.join(', ') || '—',
              ],
              [
                'Flagged dates',
                dateAnalysis.flaggedDates.length.toLocaleString(),
              ],
            ]}
          />
        </DetailSection>
      )}

      <DetailSection title="Quality issues">
        {issues.length === 0 ? (
          <p className="text-sm text-emerald-700 dark:text-emerald-400">
            No quality issues detected for this column.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {issues.map((issue, index) => (
              <li
                key={`${issue.checkName}-${index}`}
                className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300"
              >
                {issue.description}
              </li>
            ))}
          </ul>
        )}
      </DetailSection>
    </div>
  )
}

function DetailSection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <div>
      <h4 className="mb-1.5 text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
        {title}
      </h4>
      {children}
    </div>
  )
}

function StatGrid({ stats }: { stats: [string, string][] }) {
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {stats.map(([label, value]) => (
        <div
          key={label}
          className="rounded-md bg-white px-2 py-1.5 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700"
        >
          <dt className="text-[11px] text-slate-500 dark:text-slate-400">
            {label}
          </dt>
          <dd className="truncate font-mono text-sm text-slate-900 dark:text-slate-100">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function formatNumber(value: number): string {
  return Number.isInteger(value)
    ? value.toLocaleString()
    : value.toLocaleString(undefined, { maximumFractionDigits: 2 })
}
