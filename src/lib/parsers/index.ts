/**
 * Parser entry point — Phase 2, Milestone 2.4 (Normalization & Arquero
 * integration). This is the single function the rest of the app should call
 * to go from an uploaded `File` to an Arquero table: it dispatches to the
 * right per-format parser (`csv.ts`, `xlsx.ts`, `sql.ts`), reconciles their
 * inconsistent output shapes into one `NormalizedTable`, and builds the
 * Arquero `ColumnTable` from it.
 *
 * ## Reconciling the three parsers
 *
 * The three sibling parsers were built independently and don't agree on
 * shape:
 * - `parseCsvTsv` returns `ParsedTable` (`rowCount`, `encoding`, `delimiter`)
 *   and throws `FileParseError` (message + optional string `cause`).
 * - `parseExcel` returns `ParsedExcelResult` (no `rowCount`; sheet metadata
 *   instead) and throws `ExcelParseError` (an `Error` subclass with an
 *   `unknown` `cause`, no structured cause *tag*).
 * - `parseSqlDump` returns `SqlParseResult` (`totalRowCount`/`truncated`
 *   instead of a plain `rowCount`, plus `tableName`/`columnTypes`) and
 *   throws a **plain `Error`** with only a message — no dedicated error
 *   class at all.
 *
 * Rather than pick one parser's shape and force the others into it (or
 * leave three different error types leaking out of this module), this file:
 *
 * 1. Extends `ParsedTable` into `NormalizedTable` (in
 *    `src/types/parsedTable.ts`) — the canonical contract every format is
 *    converted to. It keeps `headers`/`rows`/`rowCount` as the required
 *    common core, makes CSV-only fields (`encoding`/`delimiter`) optional
 *    rather than forcing meaningless values onto Excel/SQL results, and adds
 *    a `sourceFormat` tag plus each format's real metadata (sheet info,
 *    SQL schema info) as optional fields so no information is thrown away.
 * 2. Reuses `FileParseError` (already defined alongside `ParsedTable`) as
 *    the *one* error type this module ever throws. Every parser's failure —
 *    whether it's already a `FileParseError`, an `ExcelParseError`, or a
 *    bare `Error` from the SQL parser — is caught here and re-wrapped into a
 *    `FileParseError`, with a best-effort `cause` tag inferred from the
 *    inner error's message when the source didn't already provide one
 *    (`ExcelParseError`/plain `Error` don't carry a structured cause the way
 *    `FileParseError` does).
 *
 * This is done at the integration layer (here) rather than by editing
 * `xlsx.ts`/`sql.ts`'s internals: those modules' parsing logic is
 * independent of this reconciliation problem, and adapting at the boundary
 * keeps each parser's own module free to evolve its internal error/shape
 * details without every change rippling into this file's dispatch logic.
 */
import * as aq from 'arquero'
import { getFileExtension } from '../../utils/fileValidation'
import { FileParseError } from '../../types/parsedTable'
import type { NormalizedTable, SourceFormat } from '../../types/parsedTable'
import { parseCsvTsv } from './csv'
import { parseExcel, ExcelParseError } from './xlsx'
import { parseSqlDump } from './sql'

export { FileParseError }
export type { NormalizedTable, SourceFormat }

/** Result of successfully parsing a file all the way to an Arquero table. */
export interface ParseFileResult {
  /** The parsed data as an Arquero `ColumnTable`, ready for downstream analysis. */
  table: aq.ColumnTable
  /** The normalized metadata (shape, source format, format-specific extras) behind the table. */
  meta: NormalizedTable
}

const EXTENSION_TO_FORMAT: Record<string, SourceFormat> = {
  '.csv': 'csv',
  '.tsv': 'tsv',
  '.xls': 'xls',
  '.xlsx': 'xlsx',
  '.sql': 'sql',
}

/**
 * Parses an uploaded file (`.csv`, `.tsv`, `.xls`, `.xlsx`, or `.sql`) into
 * an Arquero table, dispatching to the format-appropriate parser and
 * normalizing its result first.
 *
 * This is the data-validation step for the ingestion pipeline: every
 * failure mode — an empty file, an unsupported extension, a corrupt/
 * unparseable file, or a structurally-valid-but-empty parse result (e.g. a
 * workbook whose first sheet has no header row) — is caught and surfaced as
 * a single `FileParseError` with a clear, user-facing `message` and, when
 * one can be identified, a short machine-checkable `cause` tag (e.g.
 * `"empty file"`, `"missing header row"`, `"corrupt file"`,
 * `"unsupported encoding"`). Callers should never see a raw parser
 * exception or an unhandled crash from this function.
 *
 * @throws {FileParseError} If the file is empty, has an unsupported
 *   extension, or its contents can't be parsed into a usable table.
 */
export async function parseFileToArqueroTable(
  file: File,
): Promise<ParseFileResult> {
  if (file.size === 0) {
    throw new FileParseError(`"${file.name}" is empty.`, 'empty file')
  }

  const extension = getFileExtension(file.name)
  const format = EXTENSION_TO_FORMAT[extension]
  if (!format) {
    throw new FileParseError(
      `"${file.name}" is not a supported file type. Accepted formats: CSV, TSV, XLS, XLSX, SQL.`,
      'unsupported file type',
    )
  }

  const meta = await parseByFormat(file, format)
  validateNormalizedTable(file, meta)

  const table = aq.from(meta.rows)

  return { table, meta }
}

/** Dispatches to the right per-format parser and normalizes its result to `NormalizedTable`. */
async function parseByFormat(
  file: File,
  format: SourceFormat,
): Promise<NormalizedTable> {
  switch (format) {
    case 'csv':
    case 'tsv': {
      const result = await runCatching(file, 'CSV/TSV', () => parseCsvTsv(file))
      return { ...result, sourceFormat: format }
    }
    case 'xls':
    case 'xlsx': {
      const result = await runCatching(file, 'Excel', () => parseExcel(file))
      return {
        headers: result.headers,
        rows: result.rows,
        rowCount: result.rows.length,
        sourceFormat: format,
        sheetNames: result.sheetNames,
        sheetName: result.sheetName,
        sheetIndex: result.sheetIndex,
      }
    }
    case 'sql': {
      const result = await runCatching(file, 'SQL', () => parseSqlDump(file))
      return {
        headers: result.headers,
        rows: result.rows,
        rowCount: result.rows.length,
        sourceFormat: 'sql',
        tableName: result.tableName,
        columnTypes: result.columnTypes,
        truncated: result.truncated,
        totalRowCount: result.totalRowCount,
      }
    }
  }
}

/**
 * Runs a single parser call, translating whatever it throws (already a
 * `FileParseError`, an `ExcelParseError`, a plain `Error`, or something
 * non-`Error`) into a `FileParseError`. Forwards an existing `cause` tag
 * when the source error already had one (`FileParseError`), otherwise
 * infers one from the message text.
 */
async function runCatching<T>(
  file: File,
  formatLabel: string,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run()
  } catch (error) {
    if (error instanceof FileParseError) throw error

    if (error instanceof ExcelParseError) {
      throw new FileParseError(error.message, inferCause(error.message))
    }

    const message = error instanceof Error ? error.message : String(error)

    // The SQL parser throws plain `Error`s with an already user-facing
    // message (per its own doc comment); anything else gets a generic
    // format-labeled wrapper message.
    const wrappedMessage =
      error instanceof Error
        ? message
        : `"${file.name}" could not be parsed as ${formatLabel}: ${message}`

    throw new FileParseError(wrappedMessage, inferCause(message))
  }
}

/** Ordered message-keyword -> cause-tag rules, most specific first. */
const CAUSE_PATTERNS: [RegExp, string][] = [
  [/empty/i, 'empty file'],
  [/password/i, 'password protected'],
  [/exceeds the .*limit|too large/i, 'file too large'],
  [
    /no usable header row|doesn't have a usable header row|no recognizable column/i,
    'missing header row',
  ],
  [/no create table statement found/i, 'missing table schema'],
  [
    /could not be read as an excel file|not a real \.xls|corrupted/i,
    'corrupt file',
  ],
  [/out of range/i, 'invalid sheet selection'],
  [/took longer than/i, 'parse timeout'],
  [/could not be read/i, 'unreadable file'],
  [/windows-1252|encoding/i, 'unsupported encoding'],
]

/** Best-effort classification of a low-level error message into a short cause tag. */
function inferCause(message: string): string | undefined {
  for (const [pattern, cause] of CAUSE_PATTERNS) {
    if (pattern.test(message)) return cause
  }
  return undefined
}

/**
 * Catches the case where a parser succeeds without throwing but still
 * returns unusable data (e.g. an Excel sheet with no rows at all, which
 * `parseExcel` deliberately returns as `{ headers: [], rows: [] }` rather
 * than throwing). A table with no columns can't be turned into anything
 * meaningful downstream, so it's treated as a validation failure here.
 */
function validateNormalizedTable(file: File, meta: NormalizedTable): void {
  if (meta.headers.length === 0) {
    throw new FileParseError(
      `"${file.name}" doesn't contain any usable columns.`,
      'missing header row',
    )
  }
}
