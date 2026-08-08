/**
 * File extension validation for the upload feature.
 *
 * Phase 1 only validates the file extension/shell — actual parsing of
 * file contents is implemented in Phase 2 (Data Ingestion Pipeline).
 */

/** File extensions accepted by the dataset uploader, including the leading dot. */
export const ACCEPTED_FILE_EXTENSIONS = [
  '.csv',
  '.tsv',
  '.xls',
  '.xlsx',
  '.sql',
] as const

export type AcceptedFileExtension = (typeof ACCEPTED_FILE_EXTENSIONS)[number]

/** Comma-separated string suitable for an `<input accept>` attribute. */
export const ACCEPTED_FILE_EXTENSIONS_ATTR = ACCEPTED_FILE_EXTENSIONS.join(',')

/** Human-readable list of accepted extensions, e.g. "CSV, TSV, XLS, XLSX, SQL". */
export const ACCEPTED_FILE_EXTENSIONS_LABEL = ACCEPTED_FILE_EXTENSIONS.map(
  (ext) => ext.slice(1).toUpperCase(),
).join(', ')

/**
 * Returns the lowercased extension of a file name, including the leading dot,
 * or an empty string if the file name has no extension.
 */
export function getFileExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf('.')
  if (lastDot === -1 || lastDot === fileName.length - 1) return ''
  return fileName.slice(lastDot).toLowerCase()
}

/**
 * Validates that a file's extension is one of the supported dataset formats.
 * Returns `null` when valid, or a user-facing error message when invalid.
 */
export function validateFileExtension(file: File): string | null {
  const extension = getFileExtension(file.name)
  if (
    !extension ||
    !ACCEPTED_FILE_EXTENSIONS.includes(extension as AcceptedFileExtension)
  ) {
    return `"${file.name}" is not a supported file type. Accepted formats: ${ACCEPTED_FILE_EXTENSIONS_LABEL}.`
  }
  return null
}
