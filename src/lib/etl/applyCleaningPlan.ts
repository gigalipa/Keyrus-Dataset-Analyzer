/**
 * ETL cleaning engine & audit trail — Phase 10, Milestone 10.2. Consumes
 * Milestone 10.1's LLM-authored `CleaningPlan` (`src/lib/llm/cleaningPlan.ts`)
 * and the raw Arquero `ColumnTable`, and mechanically applies it: exact-match
 * value-mapping replacement, missing-value policy handling, and defensive
 * type coercion. This module makes **no LLM calls** — the plan was already
 * generated in Milestone 10.1; this is the deterministic, honest, non-AI
 * table manipulation that turns that plan into a genuinely different table.
 *
 * ## Contract
 *
 * `applyCleaningPlan(table, plan)` is pure and synchronous. It never throws:
 * a plan entry that references a column absent from `table`, or a value that
 * fails to coerce to its target type, is recorded in the returned
 * `AuditTrail` rather than applied or allowed to crash the pipeline.
 *
 * Per-column plan entries are applied in a fixed order: value mappings, then
 * the missing-value policy, then type coercion — matching the order they're
 * documented in `cleaningPlan.ts`'s module doc and the order a human would
 * naturally reason about them (unify values, decide what "missing" means,
 * then settle on a final type).
 *
 * The "empty" notion used for `missingValuePolicy` mirrors
 * `src/lib/analysis/quality.ts`'s `isEmptyValue` exactly (null/undefined/
 * NaN/blank-string) — duplicated here rather than imported since that
 * helper isn't exported, but kept byte-for-byte identical in behavior so the
 * ETL engine and the quality checks that informed the plan agree on what
 * counts as missing.
 */
import * as aq from 'arquero'
import type {
  CleaningPlan,
  ColumnCleaningPlan,
  TypeCoercionTarget,
} from '../llm/cleaningPlan'

// ---------------------------------------------------------------------------
// Audit trail types
// ---------------------------------------------------------------------------

/** The category of change a single audit-trail entry describes. */
export type AuditChangeType =
  | 'value-mapping'
  | 'missing-value-policy'
  | 'type-coercion'
  | 'skipped-invalid-column'

/**
 * One self-contained record of a single applied (or skipped) change, meant
 * to be displayable directly by Milestone 10.5's "how issues were managed"
 * UI without further lookups: it names the column, the kind of change, the
 * plan's own stated reason (quoted verbatim, never paraphrased), how many
 * rows were affected, and whether it was actually applied.
 */
export interface AuditTrailEntry {
  /** Column this entry concerns. May not exist in the table for `skipped-invalid-column` entries. */
  columnName: string
  /** What kind of change this is. */
  changeType: AuditChangeType
  /** Short human-readable summary of what changed, e.g. `Mapped "web" -> "Web"` or `Coerced to integer`. */
  description: string
  /** The plan's own stated reason, quoted verbatim (never paraphrased or dropped). */
  reason: string
  /** Number of rows affected by this specific change. `0` for no-ops (e.g. `leave-null`) or skipped entries. */
  affectedRows: number
  /** Whether this change was actually applied to the cleaned table. `false` for skipped/invalid entries and intentional no-ops like `leave-null`. */
  applied: boolean
}

/** Full audit trail for one `applyCleaningPlan` run: every entry, applied or skipped. */
export interface AuditTrail {
  entries: AuditTrailEntry[]
}

/** Result of `applyCleaningPlan`: the cleaned table plus the audit trail explaining every change. */
export interface ApplyCleaningPlanResult {
  cleanedTable: aq.ColumnTable
  auditTrail: AuditTrail
}

// ---------------------------------------------------------------------------
// Shared "empty" notion — mirrors quality.ts's isEmptyValue exactly.
// ---------------------------------------------------------------------------

/** True for `null`, `undefined`, NaN, or a blank/whitespace-only string — matches quality.ts/structural.ts's notion of "empty". */
function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'number') return Number.isNaN(value)
  if (typeof value === 'string') return value.trim() === ''
  return false
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Mechanically applies `plan` to `table`, producing a new (never mutated
 * in place — Arquero tables are immutable anyway) cleaned table and a
 * structured audit trail of every applied and skipped change. Never throws:
 * invalid plan entries (nonexistent columns) and per-value coercion
 * failures are recorded as audit-trail entries instead.
 */
export function applyCleaningPlan(
  table: aq.ColumnTable,
  plan: CleaningPlan,
): ApplyCleaningPlanResult {
  const entries: AuditTrailEntry[] = []
  const tableColumnNames = new Set(table.columnNames())

  // Working copy of every column's values, keyed by column name, mutated in
  // place as each rule is applied. Rebuilt into a fresh aq.table() at the end
  // — cheaper than re-deriving an Arquero table after every single rule.
  const columns: Record<string, unknown[]> = {}
  for (const name of table.columnNames()) {
    columns[name] = table.array(name) as unknown[]
  }

  for (const columnPlan of plan.columns) {
    if (!tableColumnNames.has(columnPlan.columnName)) {
      entries.push({
        columnName: columnPlan.columnName,
        changeType: 'skipped-invalid-column',
        description: `Skipped cleaning plan for column "${columnPlan.columnName}": column does not exist in this dataset.`,
        reason: `Column "${columnPlan.columnName}" does not exist in this dataset.`,
        affectedRows: 0,
        applied: false,
      })
      continue
    }

    applyValueMappings(columns, columnPlan, entries)
    applyTypeCoercion(columns, columnPlan, entries)
  }

  // Missing-value policies are applied in a second pass, after every
  // column's value mappings/coercions have run, so a 'drop-row' policy sees
  // the fully-cleaned values (e.g. a value mapping that turned a blank
  // string into a real value shouldn't then get dropped as "missing").
  let rowIndicesToDrop: Set<number> | null = null
  for (const columnPlan of plan.columns) {
    if (!tableColumnNames.has(columnPlan.columnName)) continue
    const dropped = applyMissingValuePolicy(columns, columnPlan, entries)
    if (dropped) {
      rowIndicesToDrop ??= new Set()
      for (const index of dropped) rowIndicesToDrop.add(index)
    }
  }

  let cleanedColumns = columns
  if (rowIndicesToDrop && rowIndicesToDrop.size > 0) {
    cleanedColumns = {}
    for (const [name, values] of Object.entries(columns)) {
      cleanedColumns[name] = values.filter(
        (_, index) => !rowIndicesToDrop!.has(index),
      )
    }
  }

  const cleanedTable = aq.table(cleanedColumns)

  return { cleanedTable, auditTrail: { entries } }
}

// ---------------------------------------------------------------------------
// Value mappings
// ---------------------------------------------------------------------------

function applyValueMappings(
  columns: Record<string, unknown[]>,
  columnPlan: ColumnCleaningPlan,
  entries: AuditTrailEntry[],
): void {
  const values = columns[columnPlan.columnName]

  for (const mapping of columnPlan.valueMappings) {
    let affectedRows = 0
    for (let i = 0; i < values.length; i++) {
      if (!isEmptyValue(values[i]) && String(values[i]) === mapping.from) {
        values[i] = mapping.to
        affectedRows++
      }
    }

    entries.push({
      columnName: columnPlan.columnName,
      changeType: 'value-mapping',
      description: `Mapped "${mapping.from}" -> "${mapping.to}" in column "${columnPlan.columnName}".`,
      reason: mapping.reason,
      affectedRows,
      applied: affectedRows > 0,
    })
  }
}

// ---------------------------------------------------------------------------
// Missing-value policy
// ---------------------------------------------------------------------------

/**
 * Applies `columnPlan.missingValuePolicy`, if any. Returns the set of row
 * indices to drop for a `'drop-row'` policy (actual removal is deferred to
 * the caller, which coordinates dropping across all columns' policies at
 * once), or `null` if no rows need dropping (including when there is no
 * policy at all, or the policy isn't `'drop-row'`).
 */
function applyMissingValuePolicy(
  columns: Record<string, unknown[]>,
  columnPlan: ColumnCleaningPlan,
  entries: AuditTrailEntry[],
): Set<number> | null {
  const policy = columnPlan.missingValuePolicy
  if (!policy) return null

  const values = columns[columnPlan.columnName]

  if (policy.action === 'drop-row') {
    const rowsToDrop = new Set<number>()
    for (let i = 0; i < values.length; i++) {
      if (isEmptyValue(values[i])) rowsToDrop.add(i)
    }
    entries.push({
      columnName: columnPlan.columnName,
      changeType: 'missing-value-policy',
      description: `Dropped ${rowsToDrop.size} row(s) missing a value in column "${columnPlan.columnName}".`,
      reason: policy.reason,
      affectedRows: rowsToDrop.size,
      applied: rowsToDrop.size > 0,
    })
    return rowsToDrop.size > 0 ? rowsToDrop : null
  }

  if (policy.action === 'fill-default') {
    let affectedRows = 0
    for (let i = 0; i < values.length; i++) {
      if (isEmptyValue(values[i])) {
        values[i] = policy.defaultValue
        affectedRows++
      }
    }
    entries.push({
      columnName: columnPlan.columnName,
      changeType: 'missing-value-policy',
      description: `Filled ${affectedRows} missing value(s) in column "${columnPlan.columnName}" with default ${JSON.stringify(policy.defaultValue)}.`,
      reason: policy.reason,
      affectedRows,
      applied: affectedRows > 0,
    })
    return null
  }

  // 'leave-null': an intentional no-op, but still logged so the decision
  // (and its stated reason) is visible in the audit trail.
  entries.push({
    columnName: columnPlan.columnName,
    changeType: 'missing-value-policy',
    description: `Left missing values in column "${columnPlan.columnName}" as-is (no-op by design).`,
    reason: policy.reason,
    affectedRows: 0,
    applied: false,
  })
  return null
}

// ---------------------------------------------------------------------------
// Type coercion
// ---------------------------------------------------------------------------

function applyTypeCoercion(
  columns: Record<string, unknown[]>,
  columnPlan: ColumnCleaningPlan,
  entries: AuditTrailEntry[],
): void {
  const rule = columnPlan.typeCoercion
  if (!rule) return

  const values = columns[columnPlan.columnName]

  let coercedRows = 0
  let failedRows = 0
  for (let i = 0; i < values.length; i++) {
    const value = values[i]
    if (isEmptyValue(value)) continue

    const result = coerceValue(value, rule.targetType)
    if (result.ok) {
      values[i] = result.value
      coercedRows++
    } else {
      failedRows++
    }
  }

  entries.push({
    columnName: columnPlan.columnName,
    changeType: 'type-coercion',
    description:
      failedRows === 0
        ? `Coerced ${coercedRows} value(s) in column "${columnPlan.columnName}" to ${rule.targetType}.`
        : `Coerced ${coercedRows} value(s) in column "${columnPlan.columnName}" to ${rule.targetType}; ${failedRows} value(s) could not be parsed as ${rule.targetType} and were left unchanged.`,
    reason: rule.reason,
    affectedRows: coercedRows,
    applied: coercedRows > 0,
  })
}

type CoercionResult =
  | { ok: true; value: string | number | boolean | Date }
  | { ok: false }

/**
 * Attempts to coerce a single non-empty value to `targetType`. Never
 * throws: an unparseable value returns `{ ok: false }` and the caller
 * leaves the original value in place.
 */
function coerceValue(
  value: unknown,
  targetType: TypeCoercionTarget,
): CoercionResult {
  switch (targetType) {
    case 'string':
      return { ok: true, value: String(value) }

    case 'integer': {
      const n =
        typeof value === 'number' ? value : Number(String(value).trim())
      if (Number.isNaN(n)) return { ok: false }
      return { ok: true, value: Math.trunc(n) }
    }

    case 'float':
    case 'number': {
      const n =
        typeof value === 'number' ? value : Number(String(value).trim())
      if (Number.isNaN(n)) return { ok: false }
      return { ok: true, value: n }
    }

    case 'boolean': {
      if (typeof value === 'boolean') return { ok: true, value }
      const str = String(value).trim().toLowerCase()
      if (['true', 'yes', '1'].includes(str)) return { ok: true, value: true }
      if (['false', 'no', '0'].includes(str)) return { ok: true, value: false }
      return { ok: false }
    }

    case 'date': {
      const normalized = coerceToIsoDate(value)
      return normalized ? { ok: true, value: normalized } : { ok: false }
    }

    default:
      return { ok: false }
  }
}

/** Already-normalized `YYYY-MM-DD` (no time component) — the common case when a column has mixed formats but some values are already ISO. */
const PLAIN_ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * Coerces a single value to a `YYYY-MM-DD` string. Good enough for the
 * well-formed ISO/slash/month-name strings this function is expected to see
 * (the LLM only proposes `typeCoercion: 'date'` for columns it already
 * believes are date-like), without pulling in `analysis/dates.ts`'s heavier
 * per-column majority-vote detection, which is built to *detect* date
 * columns, not coerce a single already-targeted one.
 *
 * Plain `YYYY-MM-DD` strings are matched and returned directly, bypassing
 * the `Date` constructor entirely: per the JS spec, a bare ISO date string
 * (no time component) parses as UTC midnight, while every other format
 * (slash dates, month names, `Date` instances) parses/is read in local
 * time — mixing the two via `Date`'s local getters would silently shift an
 * ISO date backward a day in any timezone west of UTC.
 */
function coerceToIsoDate(value: unknown): string | null {
  if (typeof value === 'string') {
    const isoMatch = PLAIN_ISO_DATE_RE.exec(value.trim())
    if (isoMatch) return isoMatch[0]
  }

  const date = value instanceof Date ? value : new Date(String(value).trim())
  if (Number.isNaN(date.getTime())) return null

  const y = String(date.getFullYear()).padStart(4, '0')
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
