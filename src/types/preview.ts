/**
 * Shared types for the basic data preview feature (Phase 1, Milestone 1.3).
 *
 * This is intentionally minimal: CSV/TSV files get a real (naive) delimited
 * parse, while other accepted formats (XLS, XLSX, SQL) get an honest
 * placeholder instead of a table, since their real parsers are Phase 2 work.
 */

/** A parsed, tabular preview of a delimited text file (CSV/TSV). */
export interface TablePreview {
  kind: 'table'
  /** Column header labels, in file order. */
  headers: string[]
  /** Data rows, already truncated to the preview row limit. */
  rows: string[][]
  /** Total number of data rows in the file (excluding the header row). */
  totalRowCount: number
  /** Number of columns, derived from the header row. */
  columnCount: number
}

/** Placeholder shown for formats without a real parser yet (Phase 2 work). */
export interface UnsupportedPreview {
  kind: 'unsupported'
  message: string
}

export type FilePreview = TablePreview | UnsupportedPreview
