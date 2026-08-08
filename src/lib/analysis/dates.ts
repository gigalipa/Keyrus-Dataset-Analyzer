/**
 * Date analysis — Phase 3, Milestone 3.4. Consumes the `ColumnMetadata[]`
 * produced by `analyzeStructure` (Milestone 3.1, `src/lib/analysis/structural.ts`)
 * as a starting point, but performs its own, more careful per-value parsing
 * pass over every column (not just the up-to-200-value sample 3.1 uses) so
 * this milestone owns date correctness end to end: detection, range,
 * future/old flagging, and normalization to `YYYY-MM-DD`.
 *
 * ## Contract
 *
 * `analyzeDateColumns(table, columns)` is pure and synchronous. It:
 *  1. Re-detects date columns itself by attempting to parse every value in
 *     every column and requiring a majority (`DATE_MAJORITY_THRESHOLD`) of
 *     non-empty values to parse successfully — this both catches columns
 *     Milestone 3.1 under-classified (e.g. sampled the wrong 200 rows) and
 *     excludes columns 3.1 over-classified as `'date'` from a thin sample.
 *  2. For each detected date column, computes the min/max date and duration
 *     in days.
 *  3. Flags any parsed date after today or before 1900-01-01.
 *  4. Normalizes every value in the column to `YYYY-MM-DD` (or `null` for
 *     values that fail to parse as a date), per the resolved Open Questions
 *     decision ("Date format detection").
 *
 * ## MM/DD vs DD/MM ambiguity
 *
 * For purely numeric slash/dash/dot dates with a 2- or 4-digit year at the
 * end (e.g. `03/04/2024`), the first-vs-second component order is
 * ambiguous. This module resolves it as follows:
 *  - If one of the two components is > 12, it must be the day — the other
 *    is the month (unambiguous EU `DD/MM/YYYY` or US `MM/DD/YYYY` reading).
 *  - If both components are <= 12 (genuinely ambiguous, e.g. `03/04/2024`),
 *    **this module assumes US ordering (`MM/DD/YYYY`)**, since the app's
 *    source dataset (Lakeside Provisions) is US-based. This is a documented
 *    assumption, not a guarantee of correctness for individual ambiguous
 *    values.
 */
import * as aq from 'arquero'
import type { ColumnMetadata } from './structural'

/** Human-readable labels for the date formats this module can recognize. */
export type DetectedDateFormat =
  | 'ISO-8601'
  | 'ISO-like-slash'
  | 'US-slash'
  | 'EU-slash'
  | 'Date-object'
  | 'Other'

/** A single flagged (future or too-old) date found in a date column. */
export interface FlaggedDate {
  /** The raw, un-normalized value as it appeared in the table. */
  originalValue: unknown
  /** The value normalized to `YYYY-MM-DD`. */
  normalized: string
  /** Why it was flagged. */
  reason: 'future' | 'too-old'
}

/** Per-column date analysis result. */
export interface DateColumnAnalysis {
  /** Column name. */
  column: string
  /** Distinct date formats found among this column's parseable values. */
  detectedFormats: DetectedDateFormat[]
  /** Earliest parsed date in the column, as `YYYY-MM-DD`. */
  minDate: string
  /** Latest parsed date in the column, as `YYYY-MM-DD`. */
  maxDate: string
  /** `maxDate - minDate` expressed in whole days. */
  durationDays: number
  /** Parseable dates that fall after today or before 1900-01-01. */
  flaggedDates: FlaggedDate[]
  /**
   * Every value in the column, normalized to `YYYY-MM-DD`. Values that
   * could not be parsed as a date become `null`.
   */
  normalizedValues: (string | null)[]
}

/** Share of non-empty values in a column that must parse as dates for the column to be treated as a date column. */
const DATE_MAJORITY_THRESHOLD = 0.7

/** Dates before this are flagged as "too old". */
const MIN_REASONABLE_YEAR = 1900

/** ISO-8601 date/datetime, e.g. 2024-01-31 or 2024-01-31T10:00:00Z. Captures Y/M/D. */
const ISO_DATE_RE =
  /^(\d{4})-(\d{2})-(\d{2})(?:[t ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:z|[+-]\d{2}:?\d{2})?)?$/i

/** Purely numeric date with a single consistent separator among `/`, `-`, `.`. Captures the three components in order. */
const NUMERIC_DATE_RE = /^(\d{1,4})([/.-])(\d{1,2})\2(\d{1,4})$/

/** A resolved calendar date plus which recognized format produced it. */
interface ParsedDate {
  year: number
  month: number // 1-12
  day: number
  format: DetectedDateFormat
}

/**
 * Analyzes date columns in `table`. Independently re-detects which columns
 * are date columns (starting from, but not blindly trusting,
 * `columns[].dataType === 'date'` from Milestone 3.1's structural analysis),
 * then computes range, future/old flags, and full YYYY-MM-DD normalization
 * for each.
 */
export function analyzeDateColumns(
  table: aq.ColumnTable,
  columns: ColumnMetadata[],
): DateColumnAnalysis[] {
  const results: DateColumnAnalysis[] = []
  const today = new Date()

  for (const column of columns) {
    const rawValues = table.array(column.name) as unknown[]
    if (rawValues.length === 0) continue

    const parsedByIndex: (ParsedDate | null)[] = rawValues.map(parseDateValue)

    let nonEmptyCount = 0
    let parseableCount = 0
    for (let i = 0; i < rawValues.length; i++) {
      if (isEmptyValue(rawValues[i])) continue
      nonEmptyCount++
      if (parsedByIndex[i]) parseableCount++
    }

    if (nonEmptyCount === 0) continue
    const isDateColumn =
      parseableCount / nonEmptyCount >= DATE_MAJORITY_THRESHOLD
    if (!isDateColumn) continue

    const normalizedValues: (string | null)[] = []
    const detectedFormats = new Set<DetectedDateFormat>()
    const flaggedDates: FlaggedDate[] = []
    let minParsed: ParsedDate | null = null
    let maxParsed: ParsedDate | null = null

    for (let i = 0; i < rawValues.length; i++) {
      const parsed = parsedByIndex[i]
      if (!parsed) {
        normalizedValues.push(null)
        continue
      }

      const normalized = formatAsIsoDate(parsed)
      normalizedValues.push(normalized)
      detectedFormats.add(parsed.format)

      if (!minParsed || compareParsedDate(parsed, minParsed) < 0) {
        minParsed = parsed
      }
      if (!maxParsed || compareParsedDate(parsed, maxParsed) > 0) {
        maxParsed = parsed
      }

      if (parsed.year < MIN_REASONABLE_YEAR) {
        flaggedDates.push({
          originalValue: rawValues[i],
          normalized,
          reason: 'too-old',
        })
      } else if (isAfterToday(parsed, today)) {
        flaggedDates.push({
          originalValue: rawValues[i],
          normalized,
          reason: 'future',
        })
      }
    }

    // Guaranteed non-null: parseableCount > 0 implies at least one parsed value.
    const min = minParsed as ParsedDate
    const max = maxParsed as ParsedDate

    results.push({
      column: column.name,
      detectedFormats: Array.from(detectedFormats),
      minDate: formatAsIsoDate(min),
      maxDate: formatAsIsoDate(max),
      durationDays: diffInDays(min, max),
      flaggedDates,
      normalizedValues,
    })
  }

  return results
}

/** True for `null`, `undefined`, NaN, or a blank/whitespace-only string. */
function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'number') return Number.isNaN(value)
  if (typeof value === 'string') return value.trim() === ''
  return false
}

/** Attempts to parse a single cell value as a date. Returns `null` if it cannot be confidently parsed. */
function parseDateValue(value: unknown): ParsedDate | null {
  if (isEmptyValue(value)) return null

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    return {
      year: value.getFullYear(),
      month: value.getMonth() + 1,
      day: value.getDate(),
      format: 'Date-object',
    }
  }

  const str = String(value).trim()

  const isoMatch = ISO_DATE_RE.exec(str)
  if (isoMatch) {
    const year = Number(isoMatch[1])
    const month = Number(isoMatch[2])
    const day = Number(isoMatch[3])
    if (isValidCalendarDate(year, month, day)) {
      return { year, month, day, format: 'ISO-8601' }
    }
    return null
  }

  const numericMatch = NUMERIC_DATE_RE.exec(str)
  if (numericMatch) {
    return parseNumericDateMatch(numericMatch)
  }

  return parseFallbackDate(str)
}

/**
 * Resolves a `NUMERIC_DATE_RE` match into a `ParsedDate`, handling the
 * year-first vs year-last cases and the MM/DD vs DD/MM ambiguity (see
 * module doc) for the year-last case.
 */
function parseNumericDateMatch(match: RegExpExecArray): ParsedDate | null {
  const [, g1Str, , g2Str, g3Str] = match
  const g1 = Number(g1Str)
  const g2 = Number(g2Str)
  const g3 = Number(g3Str)

  // Year-first, e.g. 2024/03/04 (ISO-like with slashes/dots instead of dashes).
  if (g1Str.length === 4) {
    const year = g1
    const month = g2
    const day = g3
    if (!isValidCalendarDate(year, month, day)) return null
    return { year, month, day, format: 'ISO-like-slash' }
  }

  // Year-last: g1/g2 are day/month in some order, g3 is the (2- or 4-digit) year.
  const year = normalizeTwoDigitYear(g3Str, g3)

  let day: number
  let month: number
  let format: DetectedDateFormat

  if (g1 > 12 && g2 <= 12) {
    day = g1
    month = g2
    format = 'EU-slash'
  } else if (g2 > 12 && g1 <= 12) {
    month = g1
    day = g2
    format = 'US-slash'
  } else if (g1 <= 12 && g2 <= 12) {
    // Genuinely ambiguous: assume US ordering (MM/DD/YYYY) — see module doc.
    month = g1
    day = g2
    format = 'US-slash'
  } else {
    // Both > 12: not a valid day/month pair either way.
    return null
  }

  if (!isValidCalendarDate(year, month, day)) return null
  return { year, month, day, format }
}

/** Expands a 2-digit year using the common `00-68 -> 2000s, 69-99 -> 1900s` pivot; passes 4-digit years through unchanged. */
function normalizeTwoDigitYear(yearStr: string, yearNum: number): number {
  if (yearStr.length >= 4) return yearNum
  return yearNum <= 68 ? 2000 + yearNum : 1900 + yearNum
}

/**
 * Fallback for date strings `Date.parse` can understand but the ISO/numeric
 * patterns above cannot, e.g. "January 5, 2024" or "5 Jan 2024". Only
 * accepted when the string contains letters, so we never let `Date.parse`
 * loosely reinterpret plain numeric strings that already failed the
 * stricter patterns above.
 */
function parseFallbackDate(str: string): ParsedDate | null {
  if (!/[a-z]/i.test(str)) return null

  const ms = Date.parse(str)
  if (Number.isNaN(ms)) return null

  const d = new Date(ms)
  return {
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    day: d.getDate(),
    format: 'Other',
  }
}

/** Days in each month for a given year, accounting for leap years. */
function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

function isValidCalendarDate(
  year: number,
  month: number,
  day: number,
): boolean {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return false
  }
  if (month < 1 || month > 12) return false
  if (day < 1 || day > daysInMonth(year, month)) return false
  return true
}

/** Formats a `ParsedDate` as `YYYY-MM-DD`. */
function formatAsIsoDate(date: ParsedDate): string {
  const y = String(date.year).padStart(4, '0')
  const m = String(date.month).padStart(2, '0')
  const d = String(date.day).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Compares two `ParsedDate`s chronologically (negative if `a` < `b`). */
function compareParsedDate(a: ParsedDate, b: ParsedDate): number {
  if (a.year !== b.year) return a.year - b.year
  if (a.month !== b.month) return a.month - b.month
  return a.day - b.day
}

/** Whole-day difference between two `ParsedDate`s, computed via UTC epoch millis to avoid DST/timezone drift. */
function diffInDays(min: ParsedDate, max: ParsedDate): number {
  const minMs = Date.UTC(min.year, min.month - 1, min.day)
  const maxMs = Date.UTC(max.year, max.month - 1, max.day)
  return Math.round((maxMs - minMs) / (1000 * 60 * 60 * 24))
}

/** True if `date` falls after `today`'s calendar date (UTC-normalized comparison). */
function isAfterToday(date: ParsedDate, today: Date): boolean {
  const dateMs = Date.UTC(date.year, date.month - 1, date.day)
  const todayMs = Date.UTC(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  )
  return dateMs > todayMs
}
