/**
 * Numeric column analysis — Phase 3, Milestone 3.2. Builds on the
 * `ColumnMetadata[]` produced by Milestone 3.1's `analyzeStructure`
 * (`src/lib/analysis/structural.ts`): for every column classified numeric
 * (`isNumericDataType`), computes descriptive statistics (min, max, mean,
 * median, mode, standard deviation, quartiles) and flags IQR-method
 * outliers.
 *
 * ## Contract
 *
 * `analyzeNumericColumns(table, columns)` is the single entry point. It is
 * pure and synchronous, and never throws: columns with zero usable numeric
 * values (e.g. an empty table, or a column whose values are all
 * null/unparseable despite being classified numeric by 3.1) are skipped
 * rather than producing NaN-filled results.
 *
 * ## Conventions (documented per the milestone's ambiguity points)
 *
 * - **Standard deviation:** *sample* standard deviation (divides by `n - 1`,
 *   Bessel's correction), since a client's uploaded dataset is treated as a
 *   sample of a broader population rather than the entire population of
 *   interest. Columns with fewer than 2 values report `0`.
 * - **Quartiles (Q1/Q3):** linear interpolation on the sorted array using
 *   the same method as Excel's `QUARTILE.INC` / NumPy's default
 *   (`'linear'`) — index `i = p * (n - 1)` into the sorted values, then
 *   interpolate between the values at `floor(i)` and `ceil(i)`. Median is
 *   the same interpolation at `p = 0.5` (equivalent to the usual
 *   even/odd-length average-the-middle-two rule).
 * - **Mode:** the most frequent value; ties broken by picking the
 *   *smallest* tied value, for deterministic output.
 * - **Outliers:** classic Tukey IQR method — bounds are
 *   `[Q1 - 1.5*IQR, Q3 + 1.5*IQR]` where `IQR = Q3 - Q1`; any value strictly
 *   outside those bounds is flagged, paired with its original row index
 *   (index into the full column array, i.e. before non-numeric values are
 *   filtered out — matches up with `table.array(name)` / the raw row
 *   order).
 * - **Non-numeric noise:** a column classified `'integer'`/`'float'` by 3.1
 *   is a majority-vote classification, not a guarantee every value parses.
 *   Null, undefined, blank/whitespace strings, and unparseable strings are
 *   skipped when collecting values for statistics; `NaN`/`Infinity` are
 *   likewise excluded.
 */
import * as aq from 'arquero'
import type { ColumnMetadata } from './structural'
import { isNumericDataType } from './structural'

/** Descriptive statistics and IQR-based outlier analysis for one numeric column. */
export interface NumericColumnAnalysis {
  /** Column name, as it appears in the Arquero table. */
  column: string
  /** Smallest numeric value found in the column. */
  min: number
  /** Largest numeric value found in the column. */
  max: number
  /** Arithmetic mean of the column's numeric values. */
  mean: number
  /** Median (50th percentile, linear interpolation). */
  median: number
  /** Most frequent value; smallest value wins ties. */
  mode: number
  /** Sample standard deviation (n - 1 denominator); 0 if fewer than 2 values. */
  standardDeviation: number
  /** First quartile (25th percentile, linear interpolation). */
  q1: number
  /** Third quartile (75th percentile, linear interpolation). */
  q3: number
  /** Tukey IQR outlier fence: [Q1 - 1.5*IQR, Q3 + 1.5*IQR]. */
  outlierBounds: { lower: number; upper: number }
  /** Values falling outside `outlierBounds`, with their original row index. */
  outliers: { value: number; rowIndex: number }[]
}

/**
 * Computes descriptive statistics and IQR outliers for every column in
 * `columns` whose `dataType` is numeric (per `isNumericDataType`). Columns
 * with no usable numeric values after cleaning are omitted from the result.
 */
export function analyzeNumericColumns(
  table: aq.ColumnTable,
  columns: ColumnMetadata[],
): NumericColumnAnalysis[] {
  const results: NumericColumnAnalysis[] = []

  for (const column of columns) {
    if (!isNumericDataType(column.dataType)) continue

    const raw = table.array(column.name) as unknown[]
    const numericValues = extractNumericValues(raw)
    if (numericValues.length === 0) continue

    results.push(analyzeColumn(column.name, numericValues))
  }

  return results
}

/** A parsed numeric value paired with its index in the original (unfiltered) column array. */
interface IndexedValue {
  value: number
  rowIndex: number
}

/**
 * Coerces each raw column value to a finite number, keeping the original
 * row index, and dropping anything that isn't a usable number (null,
 * undefined, blank strings, unparseable strings, NaN, +/-Infinity).
 */
function extractNumericValues(raw: unknown[]): IndexedValue[] {
  const out: IndexedValue[] = []
  for (let rowIndex = 0; rowIndex < raw.length; rowIndex++) {
    const value = raw[rowIndex]
    const num = toFiniteNumber(value)
    if (num !== null) out.push({ value: num, rowIndex })
  }
  return out
}

/** Coerces a single value to a finite number, or `null` if it isn't one. */
function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value === 'boolean') return null

  if (value instanceof Date) {
    const time = value.getTime()
    return Number.isFinite(time) ? time : null
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed === '') return null
    const num = Number(trimmed)
    return Number.isFinite(num) ? num : null
  }

  return null
}

/** Computes the full `NumericColumnAnalysis` for one column's cleaned numeric values. */
function analyzeColumn(
  name: string,
  indexed: IndexedValue[],
): NumericColumnAnalysis {
  const sorted = [...indexed].sort((a, b) => a.value - b.value)
  const sortedValues = sorted.map((v) => v.value)
  const n = sortedValues.length

  const min = sortedValues[0]
  const max = sortedValues[n - 1]
  const mean = sum(sortedValues) / n
  const median = quantile(sortedValues, 0.5)
  const mode = calculateMode(sortedValues)
  const standardDeviation = sampleStandardDeviation(sortedValues, mean)
  const q1 = quantile(sortedValues, 0.25)
  const q3 = quantile(sortedValues, 0.75)
  const iqr = q3 - q1
  const lower = q1 - 1.5 * iqr
  const upper = q3 + 1.5 * iqr

  const outliers = indexed
    .filter((v) => v.value < lower || v.value > upper)
    .map((v) => ({ value: v.value, rowIndex: v.rowIndex }))
    .sort((a, b) => a.rowIndex - b.rowIndex)

  return {
    column: name,
    min,
    max,
    mean,
    median,
    mode,
    standardDeviation,
    q1,
    q3,
    outlierBounds: { lower, upper },
    outliers,
  }
}

function sum(values: number[]): number {
  let total = 0
  for (const v of values) total += v
  return total
}

/**
 * Linear-interpolation quantile (Excel `QUARTILE.INC` / NumPy `'linear'`
 * method) over an already-sorted array of numbers.
 */
function quantile(sortedValues: number[], p: number): number {
  const n = sortedValues.length
  if (n === 1) return sortedValues[0]

  const index = p * (n - 1)
  const lowerIndex = Math.floor(index)
  const upperIndex = Math.ceil(index)

  if (lowerIndex === upperIndex) return sortedValues[lowerIndex]

  const fraction = index - lowerIndex
  return (
    sortedValues[lowerIndex] +
    (sortedValues[upperIndex] - sortedValues[lowerIndex]) * fraction
  )
}

/** Sample standard deviation (n - 1 denominator); 0 for fewer than 2 values. */
function sampleStandardDeviation(values: number[], mean: number): number {
  const n = values.length
  if (n < 2) return 0

  let sumSquaredDiffs = 0
  for (const v of values) {
    const diff = v - mean
    sumSquaredDiffs += diff * diff
  }
  return Math.sqrt(sumSquaredDiffs / (n - 1))
}

/** Most frequent value; the smallest value wins ties. Input must be sorted ascending. */
function calculateMode(sortedValues: number[]): number {
  const counts = new Map<number, number>()
  for (const v of sortedValues) {
    counts.set(v, (counts.get(v) ?? 0) + 1)
  }

  let bestValue = sortedValues[0]
  let bestCount = 0
  // Iterating the already-sorted array (ascending) means the first value to
  // reach a given max count is the smallest — a strict `>` keeps it on ties.
  for (const v of sortedValues) {
    const count = counts.get(v) as number
    if (count > bestCount) {
      bestCount = count
      bestValue = v
    }
  }
  return bestValue
}
