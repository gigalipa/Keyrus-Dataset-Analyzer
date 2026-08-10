import { useMemo } from 'react'
import type { AnalysisResult } from '../../types/upload'
import type { PersistedDataset } from '../../types/persistedDataset'
import { downloadCsv } from '../../lib/csv/serializeCsv'

const PREVIEW_ROW_LIMIT = 50

interface DatasetsComparisonViewProps {
  /** The active dataset's live `AnalysisResult` — `meta` is the untouched raw parse (Milestone 6.1's `rawTable`, pre-cleaning), `table` is the live cleaned Arquero table (genuinely cleaned as of Milestone 10.3, no longer identical to `meta`). */
  analysis: AnalysisResult
  /** Original file name, used to derive the two download file names. */
  fileName: string
  /** The active dataset's persisted audit trail slot (Milestone 10.2/10.3) — used only to highlight which columns the cleaning plan actually touched (value-mapping or type-coercion applied), not to compute the tables themselves. */
  cleaning: PersistedDataset['cleaning']
}

/** Derives a `<basename>-raw.csv` / `<basename>-cleaned.csv` download name from the original dataset file name. */
function csvFileName(originalFileName: string, suffix: 'raw' | 'cleaned'): string {
  const base = originalFileName.replace(/\.[^./\\]+$/, '')
  return `${base || 'dataset'}-${suffix}.csv`
}

/**
 * Phase 10, Milestone 10.6 "raw vs. cleaned comparison" — the last Phase 10
 * milestone. Renders both tables side by side from the same Milestone 6.1
 * persisted record: `analysis.meta` (raw parse) and `analysis.table`
 * (post-Milestone-10.3 genuinely cleaned table), first `PREVIEW_ROW_LIMIT`
 * rows each, plus two download buttons that serialize the *complete*
 * raw/cleaned datasets (not the 50-row preview) to CSV via
 * `src/lib/csv/serializeCsv.ts`.
 *
 * `applyCleaningPlan.ts` never renames columns (only cleans values within
 * them — see its module doc), so the two tables are directly comparable
 * column-for-column; this view renders both against the raw table's column
 * order for a stable, honest side-by-side rather than trying to reconcile
 * two independently-ordered header lists.
 *
 * Changed-column highlighting (nice-to-have, not cell-level diffing): a
 * column heading gets a small badge in the cleaned table if the audit trail
 * (`cleaning.data.entries`) recorded an *applied* value-mapping or
 * type-coercion change for it. Cell-level diffing was deliberately skipped —
 * matching values row-for-row across the two tables would require assuming
 * row order/identity is stable between raw and cleaned, which
 * `applyCleaningPlan` doesn't guarantee beyond "same row count, same order,"
 * making a per-cell diff more fragile than valuable for what's meant to be a
 * clean, honest comparison.
 */
export function DatasetsComparisonView({
  analysis,
  fileName,
  cleaning,
}: DatasetsComparisonViewProps) {
  const rawHeaders = analysis.meta.headers
  const rawRows = analysis.meta.rows
  const cleanedHeaders = analysis.table.columnNames()

  const cleanedRowsPreview = useMemo(
    () => analysis.table.slice(0, PREVIEW_ROW_LIMIT).objects() as Record<string, unknown>[],
    [analysis.table],
  )
  const rawRowsPreview = useMemo(
    () => rawRows.slice(0, PREVIEW_ROW_LIMIT),
    [rawRows],
  )

  const changedColumns = useMemo(() => {
    const columns = new Set<string>()
    if (cleaning.status === 'done' && cleaning.data) {
      for (const entry of cleaning.data.entries) {
        if (
          entry.applied &&
          (entry.changeType === 'value-mapping' ||
            entry.changeType === 'type-coercion')
        ) {
          columns.add(entry.columnName)
        }
      }
    }
    return columns
  }, [cleaning])

  const rawRowCount = analysis.meta.rowCount
  const cleanedRowCount = analysis.table.numRows()

  const handleDownloadRaw = () => {
    downloadCsv(csvFileName(fileName, 'raw'), rawHeaders, rawRows)
  }

  const handleDownloadCleaned = () => {
    downloadCsv(
      csvFileName(fileName, 'cleaned'),
      cleanedHeaders,
      analysis.table.objects() as Record<string, unknown>[],
    )
  }

  return (
    <section
      aria-labelledby="datasets-comparison-heading"
      className="flex flex-col gap-6"
    >
      <div>
        <h2
          id="datasets-comparison-heading"
          className="text-lg font-semibold text-slate-900 dark:text-slate-100"
        >
          Raw vs. cleaned
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Side-by-side comparison of the untouched parsed data and the
          cleaned dataset the rest of this app analyzes. Columns highlighted
          below had at least one value unified or type coerced by the
          cleaning plan.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ComparisonTable
          title="Raw (untouched parse)"
          totalRowCount={rawRowCount}
          headers={rawHeaders}
          rows={rawRowsPreview}
          onDownload={handleDownloadRaw}
          downloadLabel="Download raw CSV"
        />
        <ComparisonTable
          title="Cleaned"
          totalRowCount={cleanedRowCount}
          headers={cleanedHeaders}
          rows={cleanedRowsPreview}
          onDownload={handleDownloadCleaned}
          downloadLabel="Download cleaned CSV"
          highlightedColumns={changedColumns}
        />
      </div>
    </section>
  )
}

interface ComparisonTableProps {
  title: string
  /** True total row count of the underlying dataset (not the preview) — used for the "showing N of M rows" caption. */
  totalRowCount: number
  headers: string[]
  /** Already limited to at most `PREVIEW_ROW_LIMIT` rows by the caller. */
  rows: Record<string, unknown>[]
  onDownload: () => void
  downloadLabel: string
  /** Column names to visually flag as "changed by cleaning" (cleaned table only). */
  highlightedColumns?: Set<string>
}

function ComparisonTable({
  title,
  totalRowCount,
  headers,
  rows,
  onDownload,
  downloadLabel,
  highlightedColumns,
}: ComparisonTableProps) {
  const showingAll = rows.length >= totalRowCount

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {title}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {showingAll
              ? `${totalRowCount.toLocaleString()} row${totalRowCount === 1 ? '' : 's'}`
              : `Showing ${rows.length.toLocaleString()} of ${totalRowCount.toLocaleString()} rows`}
          </p>
        </div>
        <button
          type="button"
          onClick={onDownload}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-slate-400 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-800"
        >
          {downloadLabel}
        </button>
      </div>

      {headers.length === 0 || rows.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No rows to display.
        </p>
      ) : (
        <div className="max-h-[28rem] overflow-auto rounded-lg border border-slate-200 dark:border-slate-800">
          <table className="w-full min-w-max border-collapse text-left text-sm">
            <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800">
              <tr>
                {headers.map((header) => {
                  const isChanged = highlightedColumns?.has(header) ?? false
                  return (
                    <th
                      key={header}
                      scope="col"
                      className={`whitespace-nowrap px-3 py-2 font-mono text-xs font-semibold ${
                        isChanged
                          ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300'
                          : 'text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {header}
                      {isChanged && (
                        <span
                          className="ml-1.5 rounded-full bg-amber-200 px-1.5 py-0.5 text-[10px] font-medium text-amber-900 dark:bg-amber-900 dark:text-amber-300"
                          title="This column had a value unified or type coerced by the cleaning plan."
                        >
                          changed
                        </span>
                      )}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map((row, index) => (
                <tr key={index} className="odd:bg-white even:bg-slate-50/60 dark:odd:bg-slate-900 dark:even:bg-slate-800/30">
                  {headers.map((header) => (
                    <td
                      key={header}
                      className="max-w-[16rem] truncate px-3 py-1.5 text-slate-700 dark:text-slate-300"
                      title={formatCell(row[header])}
                    >
                      {formatCell(row[header])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/** Renders a cell value for display — empty string for null/undefined, `String(...)` otherwise (no additional formatting, matching the honest "this is the actual value" purpose of the comparison view). */
function formatCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
}
