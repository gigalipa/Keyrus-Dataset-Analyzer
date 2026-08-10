/**
 * Minimal CSV serialization helper — Phase 10, Milestone 10.6's "download a
 * complete (not preview-limited) raw/cleaned dataset" buttons on the Datasets
 * comparison view. No existing CSV helper/dependency in the codebase (only
 * the *parsers*, `src/lib/parsers/csv.ts`, read CSV in — nothing writes it
 * back out), so this is new, deliberately small, and follows the same
 * `Blob` + temporary `<a download>` browser-download pattern already
 * established by `src/lib/report/markdownReport.ts`'s `downloadMarkdown`
 * rather than inventing a different mechanism.
 *
 * Encoding follows RFC 4180-style quoting: a field is wrapped in double
 * quotes only when it contains a comma, double quote, or line break: embedded
 * double quotes are escaped by doubling (`"` -> `""`). Rows are terminated
 * with `\r\n`, the RFC's canonical line ending (also what Excel/most
 * spreadsheet tools expect on Windows, this app's primary dev/target OS).
 */

/** Renders one cell value as a safe CSV field, quoting only when necessary. */
function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return ''
  const raw = value instanceof Date ? value.toISOString() : String(value)
  if (/["\n\r,]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`
  }
  return raw
}

/**
 * Serializes `headers` + `rows` (plain objects keyed by header, the shape
 * both `NormalizedTable` and Arquero's `table.objects()` produce) into a
 * complete CSV string, header row first. Every value is looked up by header
 * name rather than assuming object key order matches `headers`, so a
 * mismatched/missing key on a given row degrades to an empty field instead
 * of misaligning columns.
 */
export function rowsToCsv(
  headers: string[],
  rows: Record<string, unknown>[],
): string {
  const lines = [headers.map(escapeCsvField).join(',')]
  for (const row of rows) {
    lines.push(headers.map((header) => escapeCsvField(row[header])).join(','))
  }
  return lines.join('\r\n') + '\r\n'
}

/**
 * Triggers a browser download of `headers`/`rows` as a `.csv` file named
 * `fileName` — same `Blob` + temporary `<a download>` click approach as
 * `downloadMarkdown` (`src/lib/report/markdownReport.ts`), since this app has
 * no backend to stream a file from.
 */
export function downloadCsv(
  fileName: string,
  headers: string[],
  rows: Record<string, unknown>[],
): void {
  const content = rowsToCsv(headers, rows)
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}
