import { useDataPreview } from '../../hooks/useDataPreview'
import { DataPreviewTable } from './DataPreviewTable'
import { DatasetSummaryBar } from './DatasetSummaryBar'

interface DataPreviewSectionProps {
  /** The successfully-uploaded file to preview. */
  file: File
}

/**
 * Phase 1 "basic data display": a dataset summary bar plus a scrollable
 * preview of the first 100 rows for CSV/TSV files. Other accepted formats
 * (XLS, XLSX, SQL) don't have a real parser yet — that's Phase 2 (Data
 * Ingestion Pipeline) — so this shows an honest placeholder instead of a
 * table for those.
 */
export function DataPreviewSection({ file }: DataPreviewSectionProps) {
  const { status, preview, errorMessage } = useDataPreview(file)

  if (status === 'idle' || status === 'loading') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400"
      >
        Preparing preview...
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div
        role="alert"
        className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
      >
        Couldn't build a preview: {errorMessage ?? 'Unknown error.'}
      </div>
    )
  }

  if (!preview) return null

  if (preview.kind === 'unsupported') {
    return (
      <div className="flex flex-col gap-4">
        <DatasetSummaryBar fileName={file.name} rowCount={0} columnCount={0} />
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
          {preview.message}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <DatasetSummaryBar
        fileName={file.name}
        rowCount={preview.totalRowCount}
        columnCount={preview.columnCount}
      />
      <DataPreviewTable headers={preview.headers} rows={preview.rows} />
      {preview.totalRowCount > preview.rows.length && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Showing the first {preview.rows.length.toLocaleString()} of{' '}
          {preview.totalRowCount.toLocaleString()} rows.
        </p>
      )}
    </div>
  )
}
