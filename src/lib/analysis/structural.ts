/**
 * Structural analysis — Phase 3, Milestone 3.1. This is the foundation the
 * rest of Phase 3 (numeric stats in 3.2, data-quality checks in 3.3, date
 * analysis in 3.4) builds on: it walks the Arquero `ColumnTable` produced by
 * `parseFileToArqueroTable` (`src/lib/parsers/index.ts`) and derives, per
 * column, a name/index/inferred type/sample values, plus dataset-level
 * row/column/file-size stats.
 *
 * ## Contract
 *
 * `analyzeStructure(table, file)` is the single entry point. It is pure and
 * synchronous (no I/O beyond reading `file.size`), and never throws for a
 * structurally valid `ColumnTable` (empty tables just produce an empty
 * `columns` array with `totalRows: 0`).
 *
 * - `ColumnMetadata.dataType` is inferred by sampling actual column values
 *   (not just the first row) and classifying each sampled value, then
 *   picking the column's type by majority vote in priority order: boolean →
 *   integer → float → date → string. A column whose sampled values are all
 *   null/empty/blank is classified `'null'`. This is a lightweight
 *   heuristic — exhaustive date-format detection is Milestone 3.4's job, not
 *   this one's.
 * - `ColumnDataType` also has a `'number'` member for downstream consumers
 *   that want a generic "this column holds numbers" bucket; the inference
 *   in this file only ever emits the more specific `'integer'` or
 *   `'float'`. Use `isNumericDataType()` below to test for either.
 * - `ColumnMetadata.sampleValues` holds up to `SAMPLE_VALUES_COUNT` (5)
 *   non-null/non-empty values from the column, in row order, with their
 *   original (unstringified) runtime type.
 * - `DatasetStatistics.fileSizeMB` is `file.size / (1024 * 1024)`,
 *   unrounded — round for display at the presentation layer.
 */
import * as aq from 'arquero'

/** Per-column inferred type. `'number'` is a generic bucket never emitted by inference — see `isNumericDataType`. */
export type ColumnDataType =
  'string' | 'number' | 'integer' | 'float' | 'date' | 'boolean' | 'null'

/** Metadata describing a single column: identity, inferred type, and a few sample values. */
export interface ColumnMetadata {
  /** Column header/name, as it appears in the Arquero table. */
  name: string
  /** Zero-based position of the column among the table's columns. */
  index: number
  /** Inferred type, classified from sampled values (see module doc). */
  dataType: ColumnDataType
  /** Up to 5 non-null/non-empty sample values from the column, in row order, original type preserved. */
  sampleValues: unknown[]
}

/** Dataset-level summary statistics. */
export interface DatasetStatistics {
  /** Total number of data rows. */
  totalRows: number
  /** Total number of columns. */
  totalColumns: number
  /** Uploaded file size in megabytes (`file.size / (1024 * 1024)`), unrounded. */
  fileSizeMB: number
}

/** Full result of `analyzeStructure`: per-column metadata plus dataset-level stats. */
export interface StructuralAnalysis {
  columns: ColumnMetadata[]
  stats: DatasetStatistics
}

/** Number of sample values collected per column for `ColumnMetadata.sampleValues`. */
const SAMPLE_VALUES_COUNT = 5

/**
 * Max number of non-null values inspected per column to infer its type.
 * Large enough to be resilient to a handful of dirty rows, small enough to
 * stay cheap on wide/tall datasets.
 */
const TYPE_SAMPLE_SIZE = 200

/** A single-type classification must hold at least this share of the sample to win. */
const MAJORITY_THRESHOLD = 0.7

/** Literal strings (case-insensitive) treated as booleans during classification. */
const BOOLEAN_LITERALS = new Set(['true', 'false', 'yes', 'no'])

/** ISO-8601-ish date/datetime, e.g. 2024-01-31 or 2024-01-31T10:00:00Z. */
const ISO_DATE_RE =
  /^\d{4}-\d{2}-\d{2}(t\d{2}:\d{2}(:\d{2})?(\.\d+)?(z|[+-]\d{2}:?\d{2})?)?$/i

/** Common US/EU date patterns: MM/DD/YYYY, DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY (and 2-digit years). */
const SLASH_OR_DASH_DATE_RE = /^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/

/** Whole-number literal (optionally signed), e.g. "42" or "-7". */
const INTEGER_RE = /^[+-]?\d+$/

/** Decimal literal (optionally signed/exponent), e.g. "3.14" or "-1.2e5". */
const FLOAT_RE = /^[+-]?(\d+\.\d*|\.\d+)([eE][+-]?\d+)?$/

/** The five concrete types a single non-null value can classify as. */
type ValueClassification = 'boolean' | 'integer' | 'float' | 'date' | 'string'

/**
 * Analyzes the structure of a parsed dataset: column metadata (name, index,
 * inferred type, sample values) and dataset-level statistics (row count,
 * column count, file size). Pure/synchronous; safe to call on an empty
 * table.
 */
export function analyzeStructure(
  table: aq.ColumnTable,
  file: File,
): StructuralAnalysis {
  const columnNames = table.columnNames()

  const columns: ColumnMetadata[] = columnNames.map((name, index) => {
    const values = table.array(name) as unknown[]
    return {
      name,
      index,
      dataType: inferColumnType(values),
      sampleValues: collectSampleValues(values),
    }
  })

  const stats: DatasetStatistics = {
    totalRows: table.numRows(),
    totalColumns: table.numCols(),
    fileSizeMB: file.size / (1024 * 1024),
  }

  return { columns, stats }
}

/** True for the two concrete numeric `ColumnDataType`s inference can emit. */
export function isNumericDataType(dataType: ColumnDataType): boolean {
  return dataType === 'integer' || dataType === 'float' || dataType === 'number'
}

/** True for `null`, `undefined`, NaN, or a blank/whitespace-only string. */
function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'number') return Number.isNaN(value)
  if (typeof value === 'string') return value.trim() === ''
  return false
}

/** Collects up to `SAMPLE_VALUES_COUNT` non-empty values, in original order/type. */
function collectSampleValues(values: unknown[]): unknown[] {
  const samples: unknown[] = []
  for (const value of values) {
    if (samples.length >= SAMPLE_VALUES_COUNT) break
    if (!isEmptyValue(value)) samples.push(value)
  }
  return samples
}

/**
 * Infers a column's `ColumnDataType` by classifying up to `TYPE_SAMPLE_SIZE`
 * non-empty values and picking the majority classification in priority
 * order boolean -> integer -> float -> date -> string. Falls back to
 * `'null'` when the column has no non-empty values at all.
 */
function inferColumnType(values: unknown[]): ColumnDataType {
  const counts: Record<ValueClassification, number> = {
    boolean: 0,
    integer: 0,
    float: 0,
    date: 0,
    string: 0,
  }

  let sampled = 0
  for (const value of values) {
    if (sampled >= TYPE_SAMPLE_SIZE) break
    if (isEmptyValue(value)) continue
    counts[classifyValue(value)]++
    sampled++
  }

  if (sampled === 0) return 'null'

  if (counts.boolean / sampled >= MAJORITY_THRESHOLD) return 'boolean'
  if (counts.integer / sampled >= MAJORITY_THRESHOLD) return 'integer'
  if ((counts.integer + counts.float) / sampled >= MAJORITY_THRESHOLD) {
    return 'float'
  }
  if (counts.date / sampled >= MAJORITY_THRESHOLD) return 'date'
  return 'string'
}

/** Classifies a single non-empty value. */
function classifyValue(value: unknown): ValueClassification {
  if (typeof value === 'boolean') return 'boolean'

  if (typeof value === 'number') {
    return Number.isInteger(value) ? 'integer' : 'float'
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? 'string' : 'date'
  }

  const str = String(value).trim()

  if (BOOLEAN_LITERALS.has(str.toLowerCase())) return 'boolean'
  if (INTEGER_RE.test(str)) return 'integer'
  if (FLOAT_RE.test(str)) return 'float'
  if (isDateLikeString(str)) return 'date'

  return 'string'
}

/** Reasonable heuristic date-string check: ISO/US/EU shaped AND parseable. Full detection is Milestone 3.4's job. */
function isDateLikeString(str: string): boolean {
  if (!ISO_DATE_RE.test(str) && !SLASH_OR_DASH_DATE_RE.test(str)) return false
  return !Number.isNaN(Date.parse(str))
}
