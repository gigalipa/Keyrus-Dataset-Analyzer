interface DataPreviewTableProps {
  headers: string[]
  rows: string[][]
}

/**
 * Scrollable raw data preview table. Renders whatever rows it's given
 * as-is — callers are responsible for truncating to the preview row limit.
 */
export function DataPreviewTable({ headers, rows }: DataPreviewTableProps) {
  return (
    <div className="max-h-96 overflow-auto rounded-lg border border-slate-200 dark:border-slate-800">
      <table className="min-w-full border-collapse text-left text-sm">
        <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800">
          <tr>
            {headers.map((header, index) => (
              <th
                key={`${header}-${index}`}
                scope="col"
                className="border-b border-slate-200 px-3 py-2 font-semibold whitespace-nowrap text-slate-700 dark:border-slate-700 dark:text-slate-300"
              >
                {header || `Column ${index + 1}`}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr
              key={rowIndex}
              className="odd:bg-white even:bg-slate-50 dark:odd:bg-slate-900 dark:even:bg-slate-800/40"
            >
              {headers.map((_, columnIndex) => (
                <td
                  key={columnIndex}
                  className="border-b border-slate-100 px-3 py-1.5 whitespace-nowrap text-slate-700 dark:border-slate-800 dark:text-slate-300"
                >
                  {row[columnIndex] ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
