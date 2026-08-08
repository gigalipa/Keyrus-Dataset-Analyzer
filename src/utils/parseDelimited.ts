import { getFileExtension } from './fileValidation'
import type { FilePreview } from '../types/preview'

/** Maximum number of data rows shown in the raw data preview table. */
export const PREVIEW_ROW_LIMIT = 100

interface DelimitedParseResult {
  headers: string[]
  rows: string[][]
  totalRowCount: number
}

/**
 * Minimal, "good enough" delimited-text parser used to drive the Phase 1
 * preview table. It splits on a fixed delimiter and does not handle quoted
 * fields, embedded delimiters/newlines, or encodings other than what the
 * browser's `File.text()` decodes as UTF-8 — that robustness is explicitly
 * Phase 2 (Data Ingestion Pipeline) work.
 */
export function parseDelimitedText(
  text: string,
  delimiter: ',' | '\t',
): DelimitedParseResult {
  const lines = text.split(/\r\n|\r|\n/).filter((line) => line.length > 0)
  if (lines.length === 0) {
    return { headers: [], rows: [], totalRowCount: 0 }
  }

  const headers = lines[0].split(delimiter).map((header) => header.trim())
  const dataLines = lines.slice(1)
  const rows = dataLines
    .slice(0, PREVIEW_ROW_LIMIT)
    .map((line) => line.split(delimiter))

  return { headers, rows, totalRowCount: dataLines.length }
}

const DELIMITER_BY_EXTENSION: Record<string, ',' | '\t'> = {
  '.csv': ',',
  '.tsv': '\t',
}

/**
 * Builds a Phase 1 preview for an uploaded file. CSV/TSV files are read and
 * parsed client-side into a table preview; other accepted formats (XLS,
 * XLSX, SQL) don't have a real parser yet, so an honest placeholder is
 * returned instead of faking data.
 */
export async function buildFilePreview(file: File): Promise<FilePreview> {
  const extension = getFileExtension(file.name)
  const delimiter = DELIMITER_BY_EXTENSION[extension]

  if (delimiter) {
    const text = await file.text()
    const { headers, rows, totalRowCount } = parseDelimitedText(text, delimiter)
    return {
      kind: 'table',
      headers,
      rows,
      totalRowCount,
      columnCount: headers.length,
    }
  }

  const formatLabel = extension ? extension.slice(1).toUpperCase() : 'this'
  return {
    kind: 'unsupported',
    message: `Preview for ${formatLabel} files arrives in a later phase — file received: ${file.name}`,
  }
}
