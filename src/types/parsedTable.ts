/**
 * Shared types for the "real" (Phase 2) tabular file parsers — CSV/TSV
 * (Milestone 2.1), Excel (2.2), and SQL (2.3). Every parser's output is
 * normalized down to this same shape by the Milestone 2.4 integration layer
 * (`src/lib/parsers/index.ts`) so the Arquero-conversion step has a single,
 * consistent input contract regardless of which parser produced it.
 */

/** Character encoding detected while decoding a text-based data file. */
export type DetectedEncoding = 'utf-8' | 'windows-1252'

/**
 * Result of parsing a tabular file into rows keyed by column header.
 *
 * `encoding`/`delimiter` are text-format concepts (CSV/TSV) and `undefined`
 * for binary/structured formats (Excel, SQL) that have no analogous notion.
 */
export interface ParsedTable {
  /** Column header labels, in file order. Always unique (see makeHeadersUnique). */
  headers: string[]
  /** Data rows as plain objects keyed by header. */
  rows: Record<string, unknown>[]
  /** Number of data rows (excludes the header row). Equal to `rows.length`. */
  rowCount: number
  /** Text encoding the parser detected and decoded the file with, when applicable. */
  encoding?: DetectedEncoding
  /** Delimiter character the parser used to split fields, when applicable. */
  delimiter?: string
}

/** File formats the parser entry point (Milestone 2.4) dispatches on. */
export type SourceFormat = 'csv' | 'tsv' | 'xls' | 'xlsx' | 'sql'

/**
 * `ParsedTable` plus the source format and whatever format-specific
 * metadata that format's parser exposes (sheet info for Excel, schema info
 * for SQL). This is the canonical shape every format is normalized to
 * before being handed to Arquero — see `parseFileToArqueroTable` in
 * `src/lib/parsers/index.ts`.
 */
export interface NormalizedTable extends ParsedTable {
  /** Which parser/extension produced this table. */
  sourceFormat: SourceFormat
  /** Excel only: names of every sheet in the workbook, in workbook order. */
  sheetNames?: string[]
  /** Excel only: name of the sheet that was parsed. */
  sheetName?: string
  /** Excel only: index of the sheet that was parsed. */
  sheetIndex?: number
  /** SQL only: name of the primary (first) table found in the dump. */
  tableName?: string
  /** SQL only: column name -> raw SQL type. */
  columnTypes?: Record<string, string>
  /** SQL only: true when `rows` was capped below the dump's actual row count. */
  truncated?: boolean
  /** SQL only: total data rows found across all matching INSERT statements, uncapped. */
  totalRowCount?: number
}

/**
 * A parse failure with a user-facing message and, when known, a specific
 * cause (e.g. "file too large", "empty file") so the UI can surface *why*
 * a file failed instead of a generic error, per the error-recovery decision
 * in docs/development-process.md.
 */
export class FileParseError extends Error {
  readonly cause?: string

  constructor(message: string, cause?: string) {
    super(message)
    this.name = 'FileParseError'
    this.cause = cause
  }
}
