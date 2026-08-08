interface DatasetSummaryBarProps {
  fileName: string
  rowCount: number
  columnCount: number
}

/**
 * Quick-glance summary shown at the top of the results: file name, row
 * count, and column count.
 */
export function DatasetSummaryBar({
  fileName,
  rowCount,
  columnCount,
}: DatasetSummaryBarProps) {
  return (
    <dl className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm sm:grid-cols-3 dark:border-slate-800 dark:bg-slate-800/50">
      <div>
        <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
          File name
        </dt>
        <dd
          className="mt-0.5 truncate font-semibold text-slate-900 dark:text-slate-100"
          title={fileName}
        >
          {fileName}
        </dd>
      </div>
      <div>
        <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
          Rows
        </dt>
        <dd className="mt-0.5 font-semibold text-slate-900 dark:text-slate-100">
          {rowCount.toLocaleString()}
        </dd>
      </div>
      <div>
        <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
          Columns
        </dt>
        <dd className="mt-0.5 font-semibold text-slate-900 dark:text-slate-100">
          {columnCount.toLocaleString()}
        </dd>
      </div>
    </dl>
  )
}
