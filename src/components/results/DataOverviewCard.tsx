import { formatTimestamp } from '../../utils/formatTimestamp'

interface DataOverviewCardProps {
  /** Uploaded file name. */
  fileName: string
  /** Total data rows, from Phase 3's structural analysis. */
  rowCount: number
  /** Total columns, from Phase 3's structural analysis. */
  columnCount: number
  /** Uploaded file size in megabytes, unrounded (`DatasetStatistics.fileSizeMB`). */
  fileSizeMB: number
  /** `Date.now()` captured when processing started, from `useFileUpload`. */
  uploadedAt: number
}

/**
 * Phase 5, Milestone 5.1 "data overview component": a header card showing
 * the uploaded dataset at a glance — file name, row count, column count,
 * file size, and upload timestamp — sourced entirely from the real parsing
 * + Phase 3 analysis pipeline (`useFileUpload`), not placeholder data.
 */
export function DataOverviewCard({
  fileName,
  rowCount,
  columnCount,
  fileSizeMB,
  uploadedAt,
}: DataOverviewCardProps) {
  return (
    <section
      aria-labelledby="data-overview-heading"
      className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 dark:border-slate-800 dark:bg-slate-900"
    >
      <div>
        <h2
          id="data-overview-heading"
          className="text-lg font-semibold text-slate-900 dark:text-slate-100"
        >
          Dataset overview
        </h2>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          Reflects the cleaned dataset, after automated cleaning normalized
          the raw upload.
        </p>
      </div>

      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <OverviewStat label="File name" value={fileName} title={fileName} />
        <OverviewStat label="Rows" value={rowCount.toLocaleString()} />
        <OverviewStat label="Columns" value={columnCount.toLocaleString()} />
        <OverviewStat label="File size" value={formatFileSize(fileSizeMB)} />
        <OverviewStat
          label="Uploaded"
          value={formatTimestamp(uploadedAt)}
          title={new Date(uploadedAt).toISOString()}
        />
      </dl>
    </section>
  )
}

interface OverviewStatProps {
  label: string
  value: string
  title?: string
}

function OverviewStat({ label, value, title }: OverviewStatProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/50">
      <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
        {label}
      </dt>
      <dd
        className="mt-0.5 truncate font-semibold text-slate-900 dark:text-slate-100"
        title={title}
      >
        {value}
      </dd>
    </div>
  )
}

/** Formats a megabyte value for display: KB below 1 MB, otherwise MB with 2 decimals. */
function formatFileSize(fileSizeMB: number): string {
  if (fileSizeMB < 1) {
    return `${Math.round(fileSizeMB * 1024).toLocaleString()} KB`
  }
  return `${fileSizeMB.toFixed(2)} MB`
}
