/**
 * Data quality checks — Phase 3, Milestone 3.3. Consumes the Arquero
 * `ColumnTable` plus the `ColumnMetadata[]` produced by Milestone 3.1's
 * `analyzeStructure` (`src/lib/analysis/structural.ts`) and runs four
 * independent checks against it: missing values, duplicate rows,
 * inconsistent categorical values, and mixed data types.
 *
 * ## Contract
 *
 * `analyzeDataQuality(table, columns)` is the single entry point. It is pure
 * and synchronous, and never throws — an empty table (`numRows() === 0`)
 * simply produces empty/zeroed results for every check.
 *
 * Every individual check follows the "Data Quality Check Checklist" in
 * `docs/development-process.md`: each returns one or more
 * `QualityCheckResult` objects of the shape
 * `{checkName, description, count, percentage, affectedColumns, sampleItems, severity}`.
 */
import * as aq from 'arquero'
import type { ColumnMetadata } from './structural'

/** Severity classification for a quality check result, per the Data Quality Check Checklist. */
export type QualitySeverity = 'info' | 'warning' | 'error'

/** Structured result of a single quality check, per the Data Quality Check Checklist. */
export interface QualityCheckResult {
  /** Short machine-friendly identifier, e.g. `'missing-values'`. */
  checkName: string
  /** Human-readable description of what was found. */
  description: string
  /** Number of items affected (interpretation documented per check below). */
  count: number
  /** `count` expressed as a percentage of the relevant denominator (0-100, unrounded). */
  percentage: number
  /** Column name(s) this result concerns. */
  affectedColumns: string[]
  /** Up to a handful of representative examples (values, rows, or groups depending on the check). */
  sampleItems: unknown[]
  /** How serious this finding is. */
  severity: QualitySeverity
}

/** Full data-quality report: one entry set per check category. */
export interface DataQualityReport {
  /** One result per column, always present (even when `count` is 0), so completeness is visible for every column. */
  missingValues: QualityCheckResult[]
  /** Single dataset-wide result for exact duplicate rows. */
  duplicateRows: QualityCheckResult
  /** One result per column flagged for near-duplicate/inconsistent categorical values (columns with no issues are omitted). */
  inconsistentCategoricals: QualityCheckResult[]
  /** One result per column flagged for mixing multiple inferred value-types (columns with no issues are omitted). */
  mixedTypes: QualityCheckResult[]
}

/** Max sample rows kept for the duplicate-rows check, per the Milestone 3.3 done-when condition. */
const DUPLICATE_ROW_SAMPLE_COUNT = 5

/** Max example values/groups kept in `sampleItems` for the categorical and mixed-type checks. */
const SAMPLE_ITEMS_LIMIT = 5

/** Columns with fewer distinct non-empty values than this are treated as categorical, per the Phase 3 roadmap. */
const CATEGORICAL_UNIQUE_THRESHOLD = 50

/**
 * Missing-value percentage at/above which a column is escalated from
 * `warning` to `error`. Below `MISSING_INFO_THRESHOLD` a column is only
 * `info` (a handful of blanks is normal); between the two it's a `warning`.
 */
const MISSING_ERROR_THRESHOLD = 30
const MISSING_INFO_THRESHOLD = 5

/** Duplicate-row percentage thresholds (of total rows), mirroring the missing-value thresholds. */
const DUPLICATE_WARNING_THRESHOLD = 1
const DUPLICATE_ERROR_THRESHOLD = 5

/** Mixed-type minority-value percentage thresholds (of non-null values in the column). */
const MIXED_TYPE_INFO_THRESHOLD = 5
const MIXED_TYPE_ERROR_THRESHOLD = 20

/**
 * Levenshtein distance (edit distance) is at most this many edits for two
 * *normalized* categorical values to be flagged as a likely typo of each
 * other, beyond exact-modulo-case-and-whitespace duplicates (which are
 * always flagged). Kept small and scaled by string length to avoid flagging
 * genuinely distinct short words (e.g. "USA" vs "UK").
 */
const MAX_NEAR_DUPLICATE_DISTANCE = 2

/** Runs all four Milestone 3.3 data-quality checks and returns a combined report. */
export function analyzeDataQuality(
  table: aq.ColumnTable,
  columns: ColumnMetadata[],
): DataQualityReport {
  return {
    missingValues: columns.map((column) => checkMissingValues(table, column)),
    duplicateRows: checkDuplicateRows(table),
    inconsistentCategoricals: columns
      .map((column) => checkInconsistentCategoricals(table, column))
      .filter((result): result is QualityCheckResult => result !== null),
    mixedTypes: columns
      .map((column) => checkMixedTypes(table, column))
      .filter((result): result is QualityCheckResult => result !== null),
  }
}

/** True for `null`, `undefined`, NaN, or a blank/whitespace-only string — matches structural.ts's notion of "empty". */
function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'number') return Number.isNaN(value)
  if (typeof value === 'string') return value.trim() === ''
  return false
}

function percentageOf(count: number, total: number): number {
  return total === 0 ? 0 : (count / total) * 100
}

// ---------------------------------------------------------------------------
// Check 1: Missing values
// ---------------------------------------------------------------------------

/**
 * Detects missing (null/undefined/NaN/blank-string) values in a single
 * column. Uses `table.filter` with `aq.escape` so the row-scan runs as an
 * Arquero filter operation rather than a hand-rolled loop over the array.
 *
 * False-positive risk: a column that is legitimately optional (e.g. a
 * "middle name" field) will show a high missing percentage without that
 * being a data quality *problem* — the severity here is a heuristic
 * signal, not a verdict.
 */
function checkMissingValues(
  table: aq.ColumnTable,
  column: ColumnMetadata,
): QualityCheckResult {
  const totalRows = table.numRows()
  const columnName = column.name

  const missingCount =
    totalRows === 0
      ? 0
      : table
          .filter(
            aq.escape((d: Record<string, unknown>) =>
              isEmptyValue(d[columnName]),
            ),
          )
          .numRows()

  const percentage = percentageOf(missingCount, totalRows)
  const severity: QualitySeverity =
    missingCount === 0
      ? 'info'
      : percentage >= MISSING_ERROR_THRESHOLD
        ? 'error'
        : percentage >= MISSING_INFO_THRESHOLD
          ? 'warning'
          : 'info'

  return {
    checkName: 'missing-values',
    description:
      missingCount === 0
        ? `Column "${columnName}" has no missing values.`
        : `Column "${columnName}" has ${missingCount} missing value(s) (${percentage.toFixed(1)}% of ${totalRows} rows).`,
    count: missingCount,
    percentage,
    affectedColumns: [columnName],
    sampleItems: [],
    severity,
  }
}

// ---------------------------------------------------------------------------
// Check 2: Duplicate rows
// ---------------------------------------------------------------------------

/**
 * Detects exact duplicate rows (all columns equal). Uses
 * `table.groupby(...).count()` — a native Arquero aggregation — to find
 * groups with more than one member, then walks the table once in original
 * row order to collect the first `DUPLICATE_ROW_SAMPLE_COUNT` repeat rows
 * (i.e. the 2nd+ occurrence of any row whose values have been seen before).
 *
 * `count` is the number of "extra" duplicate rows — total rows in
 * duplicated groups minus one per group — matching the common
 * `DataFrame.duplicated().sum()` convention (the first occurrence of a
 * repeated row is not itself counted as a duplicate).
 *
 * False-positive risk: legitimately identical rows (e.g. two customers
 * who happen to share every recorded attribute) will be flagged even
 * though they aren't a data entry error.
 */
function checkDuplicateRows(table: aq.ColumnTable): QualityCheckResult {
  const totalRows = table.numRows()
  const columnNames = table.columnNames()

  if (totalRows === 0 || columnNames.length === 0) {
    return {
      checkName: 'duplicate-rows',
      description: 'No rows to check for duplicates.',
      count: 0,
      percentage: 0,
      affectedColumns: [],
      sampleItems: [],
      severity: 'info',
    }
  }

  const groupCounts = table.groupby(columnNames).count()
  const duplicateGroups = groupCounts.filter(
    (d: { count: number }) => d.count > 1,
  )
  const duplicateGroupCounts = duplicateGroups.array('count') as number[]
  const extraDuplicateRowCount = duplicateGroupCounts.reduce(
    (sum, groupSize) => sum + (groupSize - 1),
    0,
  )

  const sampleItems: unknown[] = []
  if (extraDuplicateRowCount > 0) {
    const seen = new Set<string>()
    for (const row of table.objects() as Record<string, unknown>[]) {
      const signature = JSON.stringify(row)
      if (seen.has(signature)) {
        sampleItems.push(row)
        if (sampleItems.length >= DUPLICATE_ROW_SAMPLE_COUNT) break
      } else {
        seen.add(signature)
      }
    }
  }

  const percentage = percentageOf(extraDuplicateRowCount, totalRows)
  const severity: QualitySeverity =
    extraDuplicateRowCount === 0
      ? 'info'
      : percentage >= DUPLICATE_ERROR_THRESHOLD
        ? 'error'
        : percentage >= DUPLICATE_WARNING_THRESHOLD
          ? 'warning'
          : 'info'

  return {
    checkName: 'duplicate-rows',
    description:
      extraDuplicateRowCount === 0
        ? 'No duplicate rows found.'
        : `Found ${extraDuplicateRowCount} duplicate row(s) (${percentage.toFixed(1)}% of ${totalRows} rows) across ${duplicateGroupCounts.length} distinct value combination(s).`,
    count: extraDuplicateRowCount,
    percentage,
    affectedColumns: columnNames,
    sampleItems,
    severity,
  }
}

// ---------------------------------------------------------------------------
// Check 3: Inconsistent categorical values
// ---------------------------------------------------------------------------

/** Lowercase, trim, and collapse internal whitespace runs — the "definitely a duplicate" normalization. */
function normalizeForComparison(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Standard Levenshtein (edit) distance between two strings. */
function levenshteinDistance(a: string, b: string): number {
  const rows = a.length + 1
  const cols = b.length + 1
  const distances: number[][] = Array.from({ length: rows }, () =>
    new Array<number>(cols).fill(0),
  )

  for (let i = 0; i < rows; i++) distances[i][0] = i
  for (let j = 0; j < cols; j++) distances[0][j] = j

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      distances[i][j] = Math.min(
        distances[i - 1][j] + 1,
        distances[i][j - 1] + 1,
        distances[i - 1][j - 1] + cost,
      )
    }
  }

  return distances[rows - 1][cols - 1]
}

/**
 * Groups raw categorical values into clusters of likely typos/variants using
 * union-find over two relations:
 *  1. Exact match once normalized (trim + lowercase + collapse whitespace) —
 *     e.g. "Yes" / "yes " / "YES". Always flagged.
 *  2. Levenshtein distance <= `MAX_NEAR_DUPLICATE_DISTANCE` between
 *     normalized forms, scaled down for very short strings so e.g. "USA" vs
 *     "UK" (distance 2, length 3) isn't flagged. This is a heuristic, not a
 *     semantic check — "USA" vs "United States" is a real judgment call this
 *     heuristic intentionally does NOT flag (they aren't a near edit-distance
 *     match), matching the milestone's own framing of that pairing.
 *
 * Returns only groups with 2+ distinct raw values.
 */
function groupNearDuplicateValues(uniqueValues: string[]): string[][] {
  const parent = new Map<string, string>()
  for (const value of uniqueValues) parent.set(value, value)

  function find(value: string): string {
    let root = value
    while (parent.get(root) !== root) root = parent.get(root) as string
    return root
  }

  function union(a: string, b: string): void {
    const rootA = find(a)
    const rootB = find(b)
    if (rootA !== rootB) parent.set(rootA, rootB)
  }

  const normalized = uniqueValues.map((value) => normalizeForComparison(value))

  for (let i = 0; i < uniqueValues.length; i++) {
    for (let j = i + 1; j < uniqueValues.length; j++) {
      const normA = normalized[i]
      const normB = normalized[j]
      if (normA === normB) {
        union(uniqueValues[i], uniqueValues[j])
        continue
      }
      const maxLen = Math.max(normA.length, normB.length)
      // Scale the allowed distance down for short strings so unrelated short
      // words don't collide (e.g. "USA" vs "UK").
      const allowedDistance = Math.min(
        MAX_NEAR_DUPLICATE_DISTANCE,
        Math.floor(maxLen / 3),
      )
      if (allowedDistance < 1) continue
      if (levenshteinDistance(normA, normB) <= allowedDistance) {
        union(uniqueValues[i], uniqueValues[j])
      }
    }
  }

  const groups = new Map<string, string[]>()
  for (const value of uniqueValues) {
    const root = find(value)
    const group = groups.get(root)
    if (group) group.push(value)
    else groups.set(root, [value])
  }

  return Array.from(groups.values()).filter((group) => group.length > 1)
}

/**
 * For string-typed columns with fewer than `CATEGORICAL_UNIQUE_THRESHOLD`
 * distinct non-empty values, lists all values and flags clusters that look
 * like typos/casing/whitespace variants of each other. Returns `null` when
 * the column isn't categorical (too many uniques, wrong type, or empty) or
 * no issues are found.
 *
 * False-positive risk: the Levenshtein heuristic can flag legitimately
 * distinct short values that happen to be one or two edits apart (e.g.
 * "cat" vs "car"); it can also miss semantically-equivalent values that
 * aren't textually close ("USA" vs "United States"). Restricting the check
 * to `dataType === 'string'` columns avoids false positives on numeric/date
 * columns that happen to have few distinct values.
 */
function checkInconsistentCategoricals(
  table: aq.ColumnTable,
  column: ColumnMetadata,
): QualityCheckResult | null {
  if (column.dataType !== 'string') return null

  const rawValues = table.array(column.name) as unknown[]
  const uniqueValues = Array.from(
    new Set(
      rawValues
        .filter((value) => !isEmptyValue(value))
        .map((value) => String(value)),
    ),
  )

  if (
    uniqueValues.length === 0 ||
    uniqueValues.length >= CATEGORICAL_UNIQUE_THRESHOLD
  ) {
    return null
  }

  const flaggedGroups = groupNearDuplicateValues(uniqueValues)
  if (flaggedGroups.length === 0) return null

  const flaggedValueCount = flaggedGroups.reduce(
    (sum, group) => sum + group.length,
    0,
  )
  const percentage = percentageOf(flaggedValueCount, uniqueValues.length)
  const severity: QualitySeverity = percentage >= 50 ? 'error' : 'warning'

  return {
    checkName: 'inconsistent-categoricals',
    description: `Column "${column.name}" has ${flaggedGroups.length} group(s) of likely inconsistent values (casing/whitespace/near-duplicate typos) out of ${uniqueValues.length} distinct value(s), e.g. ${flaggedGroups[0].map((v) => `"${v}"`).join(' / ')}.`,
    count: flaggedValueCount,
    percentage,
    affectedColumns: [column.name],
    sampleItems: flaggedGroups.slice(0, SAMPLE_ITEMS_LIMIT),
    severity,
  }
}

// ---------------------------------------------------------------------------
// Check 4: Mixed data types
// ---------------------------------------------------------------------------

/** Coarse value-level type bucket used only for the mixed-type check (deliberately simpler than structural.ts's classifier). */
type MixedTypeBucket = 'number' | 'boolean' | 'date' | 'string'

const BOOLEAN_LITERALS = new Set(['true', 'false', 'yes', 'no'])
const NUMBER_RE = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/
const ISO_DATE_RE =
  /^\d{4}-\d{2}-\d{2}(t\d{2}:\d{2}(:\d{2})?(\.\d+)?(z|[+-]\d{2}:?\d{2})?)?$/i
const SLASH_OR_DASH_DATE_RE = /^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/

function classifyForMixedType(value: unknown): MixedTypeBucket {
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'number') return 'number'
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? 'string' : 'date'
  }

  const str = String(value).trim()
  if (BOOLEAN_LITERALS.has(str.toLowerCase())) return 'boolean'
  if (NUMBER_RE.test(str)) return 'number'
  if (
    (ISO_DATE_RE.test(str) || SLASH_OR_DASH_DATE_RE.test(str)) &&
    !Number.isNaN(Date.parse(str))
  ) {
    return 'date'
  }
  return 'string'
}

/**
 * Flags a column as having mixed data types when its non-empty values
 * classify into more than one `MixedTypeBucket` (number/boolean/date/string).
 * The dominant bucket is treated as the column's "real" type; every value
 * classified into a different bucket is a minority example. Returns `null`
 * when the column is empty or single-typed.
 *
 * False-positive risk: values that are ambiguous by nature (e.g. "2024" —
 * could be a year-as-number or a truncated date; "1"/"0" — could be a
 * boolean flag or a genuine count) may be classified inconsistently with
 * the column's intended semantics, inflating the minority count.
 */
function checkMixedTypes(
  table: aq.ColumnTable,
  column: ColumnMetadata,
): QualityCheckResult | null {
  const rawValues = table.array(column.name) as unknown[]
  const nonEmptyValues = rawValues.filter((value) => !isEmptyValue(value))
  if (nonEmptyValues.length === 0) return null

  const bucketCounts = new Map<MixedTypeBucket, number>()
  const bucketExamples = new Map<MixedTypeBucket, unknown[]>()
  for (const value of nonEmptyValues) {
    const bucket = classifyForMixedType(value)
    bucketCounts.set(bucket, (bucketCounts.get(bucket) ?? 0) + 1)
    const examples = bucketExamples.get(bucket)
    if (examples) {
      if (examples.length < SAMPLE_ITEMS_LIMIT) examples.push(value)
    } else {
      bucketExamples.set(bucket, [value])
    }
  }

  if (bucketCounts.size <= 1) return null

  const [dominantBucket] = Array.from(bucketCounts.entries()).sort(
    (a, b) => b[1] - a[1],
  )[0]
  const minorityCount =
    nonEmptyValues.length - (bucketCounts.get(dominantBucket) ?? 0)
  const percentage = percentageOf(minorityCount, nonEmptyValues.length)

  const minorityExamples: unknown[] = []
  for (const [bucket, examples] of bucketExamples) {
    if (bucket === dominantBucket) continue
    for (const example of examples) {
      minorityExamples.push(example)
      if (minorityExamples.length >= SAMPLE_ITEMS_LIMIT) break
    }
    if (minorityExamples.length >= SAMPLE_ITEMS_LIMIT) break
  }

  const severity: QualitySeverity =
    percentage >= MIXED_TYPE_ERROR_THRESHOLD
      ? 'error'
      : percentage >= MIXED_TYPE_INFO_THRESHOLD
        ? 'warning'
        : 'info'

  const otherBuckets = Array.from(bucketCounts.keys()).filter(
    (b) => b !== dominantBucket,
  )
  return {
    checkName: 'mixed-types',
    description: `Column "${column.name}" is mostly "${dominantBucket}" but also contains ${otherBuckets.map((b) => `"${b}"`).join(', ')} value(s) — ${minorityCount} of ${nonEmptyValues.length} value(s) (${percentage.toFixed(1)}%) don't match the dominant type.`,
    count: minorityCount,
    percentage,
    affectedColumns: [column.name],
    sampleItems: minorityExamples,
    severity,
  }
}
