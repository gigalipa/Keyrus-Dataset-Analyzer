/**
 * Excel (XLS/XLSX) parser — Phase 2, Milestone 2.2.
 *
 * Standalone parsing module. It is intentionally NOT wired into the upload
 * UI or into Arquero yet — that normalization work is Milestone 2.4. This
 * module only needs to convert an uploaded Excel `File` into a
 * format-agnostic `{ headers, rows }` shape (plus sheet metadata for
 * multi-sheet selection) that the later Arquero-integration milestone can
 * consume unchanged.
 *
 * Library: SheetJS `xlsx` (the CE/community build published to npm as
 * `xlsx@0.18.5`, the latest version SheetJS publishes to the npm registry —
 * later builds are only distributed from SheetJS's own CDN). It reads both
 * legacy `.xls` (BIFF/CFB) and modern `.xlsx` (OOXML) formats through the
 * same API, which is why it was chosen over an OOXML-only library.
 *
 * Known limitations (per the File Parser Checklist):
 * - Password-protected/encrypted workbooks are not supported and raise a
 *   dedicated `ExcelParseError` rather than partially parsing.
 * - Very large workbooks (particularly ones with tens of thousands of rows
 *   and many sheets) can be slow because `xlsx` parses synchronously on the
 *   main thread; there is no Web Worker offload in this module. A soft
 *   parse timeout is applied (see `EXCEL_PARSE_TIMEOUT_MS`), but because the
 *   underlying SheetJS parse call is synchronous, the timeout can only ever
 *   fire *before* or *after* that call runs, not interrupt it mid-flight.
 *   Moving heavy parsing to a Worker is a reasonable follow-up if 15MB
 *   files are found to noticeably freeze the UI.
 * - Formulas are read as their last-calculated value (`raw` cell value), not
 *   re-evaluated; charts, images, comments, and formatting are ignored —
 *   only cell values matter for this app's analysis pipeline.
 * - A cell's rich type information (currency, percentage formatting, etc.)
 *   is not preserved; numbers come through as plain JS `number`s and dates
 *   (when the cell is formatted as a date in the workbook) as JS `Date`
 *   objects. Downstream type inference (Phase 3) is expected to handle this.
 * - SheetJS is lenient about what it accepts: a plain-text file renamed to
 *   `.xlsx` is not rejected as corrupt — it gets auto-detected and parsed as
 *   a delimited-text sheet instead of raising `ExcelParseError`. Only bytes
 *   that don't resemble any format SheetJS understands (garbled binary,
 *   truncated archives, etc.) trigger the corrupt-file error path. This was
 *   confirmed empirically while verifying this module (see report).
 * - Merged cells are not unmerged/filled — only the top-left cell of a
 *   merged range carries a value; the rest come through as `null`.
 */
import * as XLSX from 'xlsx'

/** Files larger than this trigger a console warning before parsing proceeds. */
export const EXCEL_FILE_SIZE_WARNING_BYTES = 15 * 1024 * 1024 // 15MB

/** Soft ceiling on how long a parse is allowed to take before rejecting. */
export const EXCEL_PARSE_TIMEOUT_MS = 30_000

/** One row of Excel data, keyed by column header. */
export type ExcelRow = Record<string, unknown>

/** Consistent output contract shared with the CSV/TSV and SQL parsers. */
export interface ParsedExcelResult {
  /** Column header labels for the selected sheet, in column order. */
  headers: string[]
  /** Data rows from the selected sheet, one object per row keyed by header. */
  rows: ExcelRow[]
  /** Names of every sheet in the workbook, in workbook order. */
  sheetNames: string[]
  /** Name of the sheet that was actually parsed (resolves `sheetIndex`). */
  sheetName: string
  /** Index of the sheet that was actually parsed. */
  sheetIndex: number
}

/**
 * Error raised for any Excel parsing failure (corrupt file, unreadable
 * workbook, out-of-range sheet selection, empty file, etc.). Carries a
 * `cause` when the failure originated from a lower-level (SheetJS or
 * runtime) error, so callers/logs can inspect the original detail while
 * still showing `message` as the user-facing summary.
 */
export class ExcelParseError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'ExcelParseError'
  }
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new ExcelParseError(
          `${label} took longer than ${ms / 1000}s and was aborted.`,
        ),
      )
    }, ms)

    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error as Error)
      },
    )
  })
}

/**
 * Reads a `File` into an `ArrayBuffer`, wrapping the (rare) failure modes of
 * `File.arrayBuffer()` — e.g. the underlying disk file was removed or the
 * browser can't access it anymore — into an `ExcelParseError`.
 */
async function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  try {
    return await file.arrayBuffer()
  } catch (error) {
    throw new ExcelParseError(
      `Could not read "${file.name}". The file may have been moved, deleted, or is unreadable.`,
      { cause: error },
    )
  }
}

/**
 * Parses raw workbook bytes with SheetJS, translating known SheetJS failure
 * messages (corrupt file, password-protected file, unsupported format) into
 * clear, user-facing `ExcelParseError`s instead of letting a cryptic
 * low-level message reach the UI.
 */
function readWorkbook(data: ArrayBuffer, fileName: string): XLSX.WorkBook {
  try {
    const workbook = XLSX.read(data, { type: 'array', cellDates: true })
    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      throw new ExcelParseError(
        `"${fileName}" doesn't contain any sheets. The file may be empty or corrupted.`,
      )
    }
    return workbook
  } catch (error) {
    if (error instanceof ExcelParseError) throw error

    const rawMessage = error instanceof Error ? error.message : String(error)
    const lowerMessage = rawMessage.toLowerCase()

    if (lowerMessage.includes('password')) {
      throw new ExcelParseError(
        `"${fileName}" is password-protected. Remove the password and re-upload the file.`,
        { cause: error },
      )
    }

    if (
      lowerMessage.includes('unsupported') ||
      lowerMessage.includes('corrupt') ||
      lowerMessage.includes('zip') ||
      lowerMessage.includes('cfb')
    ) {
      throw new ExcelParseError(
        `"${fileName}" could not be read as an Excel file. It may be corrupted or not a real .xls/.xlsx file.`,
        { cause: error },
      )
    }

    throw new ExcelParseError(
      `"${fileName}" could not be parsed as an Excel file: ${rawMessage}`,
      { cause: error },
    )
  }
}

/**
 * Converts a worksheet's raw grid into `{ headers, rows }`, treating the
 * first row as the header row per Milestone 2.2's done-when condition.
 *
 * - Blank/undefined header cells fall back to a positional label
 *   (`Column 1`, `Column 2`, ...) so every column still gets a stable key.
 * - Duplicate header labels are suffixed (`Name`, `Name (2)`, `Name (3)`, ...)
 *   so no column silently overwrites another when rows are converted to
 *   objects.
 * - A completely empty sheet (no rows at all) yields `{ headers: [], rows: [] }`
 *   rather than throwing, matching the parseDelimited convention of "empty
 *   is a valid, if uninteresting, result."
 */
function extractSheetData(worksheet: XLSX.WorkSheet): {
  headers: string[]
  rows: ExcelRow[]
} {
  const grid: unknown[][] = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: false,
  })

  if (grid.length === 0) {
    return { headers: [], rows: [] }
  }

  const headerRow = grid[0]
  const seenHeaderCounts = new Map<string, number>()
  const headers = headerRow.map((cell, index) => {
    const label =
      cell === null || cell === undefined || String(cell).trim() === ''
        ? `Column ${index + 1}`
        : String(cell).trim()

    const seenCount = seenHeaderCounts.get(label) ?? 0
    seenHeaderCounts.set(label, seenCount + 1)
    return seenCount === 0 ? label : `${label} (${seenCount + 1})`
  })

  const rows: ExcelRow[] = grid.slice(1).map((dataRow) => {
    const row: ExcelRow = {}
    headers.forEach((header, index) => {
      row[header] = dataRow[index] ?? null
    })
    return row
  })

  return { headers, rows }
}

/**
 * Resolves a requested sheet index against the workbook's actual sheet
 * list, defaulting to the first sheet (index 0) when none is given.
 */
function resolveSheetIndex(
  sheetNames: string[],
  requestedIndex: number | undefined,
): number {
  const index = requestedIndex ?? 0
  if (!Number.isInteger(index) || index < 0 || index >= sheetNames.length) {
    throw new ExcelParseError(
      `Sheet index ${index} is out of range. This workbook has ${sheetNames.length} sheet(s): ${sheetNames.join(', ')}.`,
    )
  }
  return index
}

/**
 * Parses an uploaded XLS/XLSX file into a consistent, format-agnostic shape.
 *
 * @param file - The uploaded Excel file (`.xls` or `.xlsx`).
 * @param sheetIndex - Zero-based index of the sheet to extract data from.
 *   Defaults to the first sheet (`0`) when omitted. Callers building a sheet
 *   picker should first inspect `sheetNames` (available even without
 *   knowing the index up front, since it's returned alongside the parsed
 *   sheet) and re-call `parseExcel` with the user's chosen index.
 * @returns Headers, data rows (first row of the sheet as keys), the full
 *   list of sheet names, and which sheet was actually selected.
 * @throws {ExcelParseError} If the file can't be read, isn't a valid
 *   workbook, is password-protected, or `sheetIndex` is out of range.
 */
export async function parseExcel(
  file: File,
  sheetIndex?: number,
): Promise<ParsedExcelResult> {
  if (file.size === 0) {
    throw new ExcelParseError(`"${file.name}" is empty (0 bytes).`)
  }

  if (file.size > EXCEL_FILE_SIZE_WARNING_BYTES) {
    console.warn(
      `[parseExcel] "${file.name}" is ${(file.size / (1024 * 1024)).toFixed(1)}MB, over the ` +
        `${EXCEL_FILE_SIZE_WARNING_BYTES / (1024 * 1024)}MB guideline. Parsing may be slow.`,
    )
  }

  return withTimeout(
    (async () => {
      const data = await readFileAsArrayBuffer(file)
      const workbook = readWorkbook(data, file.name)
      const resolvedIndex = resolveSheetIndex(workbook.SheetNames, sheetIndex)
      const sheetName = workbook.SheetNames[resolvedIndex]
      const worksheet = workbook.Sheets[sheetName]

      if (!worksheet) {
        throw new ExcelParseError(
          `Sheet "${sheetName}" could not be read from "${file.name}".`,
        )
      }

      const { headers, rows } = extractSheetData(worksheet)

      return {
        headers,
        rows,
        sheetNames: workbook.SheetNames,
        sheetName,
        sheetIndex: resolvedIndex,
      }
    })(),
    EXCEL_PARSE_TIMEOUT_MS,
    `Parsing "${file.name}"`,
  )
}
