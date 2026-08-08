import Papa from 'papaparse'
import { getFileExtension } from '../../utils/fileValidation'
import { FileParseError } from '../../types/parsedTable'
import type { DetectedEncoding, ParsedTable } from '../../types/parsedTable'

/**
 * Real, production CSV/TSV parser (Milestone 2.1). Distinct from
 * `src/utils/parseDelimited.ts`, which is a deliberately naive Phase 1
 * parser used only to drive the first-100-rows preview table. This module
 * is the one later milestones (Arquero integration, analysis engine) build
 * on: it handles quoted/escaped fields, mixed line endings, delimiter
 * detection, non-UTF-8 encodings, and large files without blocking the UI.
 *
 * Library choice: PapaParse. It correctly implements RFC 4180 quoting
 * (embedded delimiters/newlines/escaped quotes) which a hand-rolled
 * `split(delimiter)` cannot, supports an off-main-thread Web Worker mode
 * for the actual parse step, and its worker is created from a self-stringified
 * module (see node_modules/papaparse's `getWorkerBlob`) rather than a
 * `document.currentScript` reference, so it works under Vite's bundler
 * without extra config. It's a single small, dependency-free package.
 */

/** Hard cap from the roadmap's large-file-handling decision (reconciled 15MB, not 50MB). */
export const MAX_PARSE_FILE_SIZE_BYTES = 15 * 1024 * 1024

/** Bytes sampled from the start of the file to sniff its text encoding. */
const ENCODING_SNIFF_BYTES = 65536

const DELIMITER_BY_EXTENSION: Record<string, ',' | '\t'> = {
  '.csv': ',',
  '.tsv': '\t',
}

export interface ParseCsvTsvOptions {
  /**
   * Force a specific delimiter instead of inferring it from the file
   * extension (with PapaParse auto-detection as the fallback for anything
   * else, e.g. semicolon-delimited exports).
   */
  delimiter?: string
}

/**
 * Parses a CSV or TSV `File` into a normalized `{ headers, rows }` table.
 *
 * Pipeline:
 * 1. Reject files over the 15MB limit before doing any work.
 * 2. Sniff the encoding from a sample of the file's bytes (UTF-8 vs
 *    Windows-1252/ISO-8859-1) and decode the whole file accordingly.
 * 3. Read the file via its stream in chunks (yielding to the event loop
 *    between reads) rather than one large synchronous `file.text()` call.
 * 4. Parse the decoded text with PapaParse, using a Web Worker when one is
 *    available so the CSV grammar parsing itself doesn't block the UI
 *    thread either.
 */
export async function parseCsvTsv(
  file: File,
  options: ParseCsvTsvOptions = {},
): Promise<ParsedTable> {
  if (file.size === 0) {
    throw new FileParseError(`"${file.name}" is empty.`, 'empty file')
  }

  if (file.size > MAX_PARSE_FILE_SIZE_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1)
    const limitMb = (MAX_PARSE_FILE_SIZE_BYTES / (1024 * 1024)).toFixed(0)
    throw new FileParseError(
      `"${file.name}" is ${sizeMb}MB, which exceeds the ${limitMb}MB limit for uploaded files.`,
      'file too large',
    )
  }

  const encoding = await detectEncoding(file)
  const text = await readFileAsText(file, encoding)

  const delimiter =
    options.delimiter ?? DELIMITER_BY_EXTENSION[getFileExtension(file.name)]

  const result = await parseWithPapa(text, delimiter)

  const rawRows = result.data
  if (rawRows.length === 0) {
    throw new FileParseError(
      `"${file.name}" has no rows to parse.`,
      'empty file',
    )
  }

  const rawHeaders = rawRows[0]
  if (
    rawHeaders.length === 0 ||
    rawHeaders.every((cell) => cell.trim() === '')
  ) {
    throw new FileParseError(
      `"${file.name}" doesn't have a usable header row.`,
      'missing header row',
    )
  }

  const headers = makeHeadersUnique(rawHeaders)
  const dataLines = rawRows.slice(1)
  const rows = dataLines.map((line) => rowToRecord(headers, line))

  return {
    headers,
    rows,
    rowCount: rows.length,
    encoding,
    delimiter: result.meta.delimiter || delimiter || ',',
  }
}

/** Builds one row object, keyed by header, from a raw array of cell strings. */
function rowToRecord(
  headers: string[],
  line: string[],
): Record<string, unknown> {
  const record: Record<string, unknown> = {}
  for (let i = 0; i < headers.length; i++) {
    record[headers[i]] = line[i] ?? ''
  }
  return record
}

/**
 * Disambiguates duplicate/blank header names (e.g. two columns both named
 * "Total") so every key in the resulting row objects is unique — otherwise
 * later columns would silently overwrite earlier ones with the same name.
 */
function makeHeadersUnique(rawHeaders: string[]): string[] {
  const seenCounts = new Map<string, number>()
  return rawHeaders.map((raw, index) => {
    const base = raw.trim() || `column_${index + 1}`
    const priorCount = seenCounts.get(base) ?? 0
    seenCounts.set(base, priorCount + 1)
    return priorCount === 0 ? base : `${base}_${priorCount + 1}`
  })
}

/**
 * Sniffs whether a file is UTF-8 or a legacy single-byte encoding by trying
 * a strict UTF-8 decode of a leading sample of bytes. Valid UTF-8 (including
 * plain ASCII) always decodes cleanly; files exported from legacy Windows
 * tools with accented characters (é, ñ, …) encoded as ISO-8859-1 or
 * Windows-1252 contain byte sequences that are *not* valid UTF-8, so the
 * strict decode throws and we fall back to Windows-1252 — a superset of
 * ISO-8859-1 in the printable range and the far more common of the two in
 * practice, so it's used as the single non-UTF-8 fallback rather than
 * distinguishing the two encodings from bytes alone. Known limitation: a
 * file that is genuinely ISO-8859-1 and uses the 0x80-0x9F range (control
 * codes in ISO-8859-1, printable punctuation like curly quotes in
 * Windows-1252) will have those specific characters rendered as the
 * Windows-1252 glyph instead.
 *
 * Cross-browser note (Milestone 5.3 compatibility pass): `Blob.slice(...)`
 * followed by `.arrayBuffer()` on the *sliced* blob throws a `NotFoundError`
 * ("The object can not be found here") in Playwright's WebKit build on
 * Windows, even though `file.arrayBuffer()` on the whole `File` and
 * `file.stream()` both work fine on the exact same `File` object. That
 * combination isn't reproducible in Chromium or Firefox, and per spec
 * `Blob.slice().arrayBuffer()` is valid, so this is most likely a quirk of
 * that specific WebKit packaging rather than a documented engine
 * limitation — but since a real Safari user could conceivably hit the same
 * failure mode, `readEncodingSampleBytes` below tries the fast sliced-read
 * path first and transparently falls back to a full-file read (already a
 * step `readFileAsText` performs anyway) if it throws, rather than letting
 * the whole upload fail on an otherwise-working file.
 */
export async function detectEncoding(file: File): Promise<DetectedEncoding> {
  const bytes = await readEncodingSampleBytes(file)

  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return 'utf-8'
  } catch {
    return 'windows-1252'
  }
}

/**
 * Reads up to `ENCODING_SNIFF_BYTES` from the start of `file`. Tries the
 * cheap `file.slice(...).arrayBuffer()` path first; if that throws (see the
 * WebKit note on `detectEncoding` above), falls back to reading the whole
 * file and slicing the resulting buffer instead.
 */
async function readEncodingSampleBytes(file: File): Promise<Uint8Array> {
  try {
    const sample = await file.slice(0, ENCODING_SNIFF_BYTES).arrayBuffer()
    return new Uint8Array(sample)
  } catch {
    const full = await file.arrayBuffer()
    return new Uint8Array(full.slice(0, ENCODING_SNIFF_BYTES))
  }
}

/**
 * Reads a file's full contents as text, decoded with the given encoding,
 * using the file's stream rather than a single `file.text()`/`arrayBuffer()`
 * call. Each chunk is read asynchronously, so control yields back to the
 * event loop between chunks instead of one long synchronous read — this is
 * what keeps large files (up to the 15MB cap) from freezing the UI during
 * the I/O phase, ahead of PapaParse's own worker-offloaded parse phase.
 */
async function readFileAsText(
  file: File,
  encoding: DetectedEncoding,
): Promise<string> {
  const decoder = new TextDecoder(encoding)

  if (typeof file.stream !== 'function') {
    // Fallback for environments without a streamable Blob (not expected in
    // any officially supported browser, but keeps this function total).
    const buffer = await file.arrayBuffer()
    return stripBom(decoder.decode(buffer))
  }

  const reader = file.stream().getReader()
  let text = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    text += decoder.decode(value, { stream: true })
  }
  text += decoder.decode()

  return stripBom(text)
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

/** True when a same-origin Web Worker is available (browser main thread). */
function canUseWorker(): boolean {
  return typeof Worker !== 'undefined'
}

/** Promise wrapper around PapaParse's callback-based API, header-less. */
function parseWithPapa(
  text: string,
  delimiter: string | undefined,
): Promise<Papa.ParseResult<string[]>> {
  return new Promise((resolve, reject) => {
    const complete = (results: Papa.ParseResult<string[]>) => resolve(results)
    const error = (err: Error) => reject(err)

    // PapaParse's TypeScript overloads key on a literal `worker: true`, so
    // the two modes need separate call sites rather than a boolean variable.
    if (canUseWorker()) {
      Papa.parse<string[]>(text, {
        header: false,
        delimiter: delimiter ?? '', // '' triggers PapaParse's delimiter auto-detection
        skipEmptyLines: 'greedy',
        worker: true,
        complete,
        error,
      })
    } else {
      Papa.parse<string[]>(text, {
        header: false,
        delimiter: delimiter ?? '',
        skipEmptyLines: 'greedy',
        complete,
        error,
      })
    }
  })
}
