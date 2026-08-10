/**
 * Persisted-dataset record shape — Phase 6, Milestone 6.1.
 *
 * This is the durable, IndexedDB-backed counterpart to the session-only
 * `AnalysisResult`/`UploadState` in `src/types/upload.ts`. Those types model
 * one in-memory upload for the lifetime of a tab; `PersistedDataset` models
 * everything the app needs to reconstruct that same upload, in full, after a
 * page reload, and to track it as one of potentially many stored datasets
 * (Milestone 6.2's History sidebar) that later phases' automated LLM
 * pipeline (Phase 8) can resume mid-sequence.
 *
 * Key differences from `AnalysisResult`:
 * - No `aq.ColumnTable` field. IndexedDB (via `structuredClone`, which the
 *   `idb` wrapper and the underlying browser API use for storage) cannot
 *   serialize Arquero's internal column-store representation, so the
 *   cleaned/normalized table is stored as plain `{ headers, rows }` data —
 *   see `CleanedTable` below — and reconstituted into a real `aq.ColumnTable`
 *   on load via `hydrateCleanedTable`.
 * - The raw parsed table (`meta` in `AnalysisResult`, pre-Arquero) is kept
 *   verbatim as `rawTable` so a later "raw vs. cleaned" comparison view
 *   (Phase 6 spec) can show the untouched parse next to the normalized one.
 * - Each LLM output is wrapped in an `LlmOutputSlot` carrying a `status`,
 *   not just the raw result, so a pipeline that dies mid-sequence (browser
 *   closed, tab crashed) can tell on reload which steps still need to run
 *   instead of re-running everything or assuming everything finished.
 */
import * as aq from 'arquero'
import type { NormalizedTable } from './parsedTable'
import type { StructuralAnalysis } from '../lib/analysis/structural'
import type { NumericColumnAnalysis } from '../lib/analysis/numeric'
import type { DataQualityReport } from '../lib/analysis/quality'
import type { DateColumnAnalysis } from '../lib/analysis/dates'
import type { InsightGroup } from '../lib/llm/schema'
import type { BusinessInsightsResult } from '../lib/llm/businessInsights'
import type { CleaningPlan } from '../lib/llm/cleaningPlan'
import type { AuditTrail } from '../lib/etl/applyCleaningPlan'

/**
 * The cleaned/normalized table, serialized as plain data instead of an
 * Arquero `ColumnTable` instance so it can be stored in and read back from
 * IndexedDB. Produced from a live table via `serializeCleanedTable` (using
 * `table.objects()`) and turned back into a live table via
 * `hydrateCleanedTable` (using `aq.from(rows)`).
 */
export interface CleanedTable {
  headers: string[]
  rows: Record<string, unknown>[]
}

/** Serializes a live Arquero table into the plain-data shape this record stores. */
export function serializeCleanedTable(table: aq.ColumnTable): CleanedTable {
  return {
    headers: table.columnNames(),
    rows: table.objects() as Record<string, unknown>[],
  }
}

/** Reconstitutes a stored `CleanedTable` back into a live Arquero `ColumnTable`. */
export function hydrateCleanedTable(cleaned: CleanedTable): aq.ColumnTable {
  return aq.from(cleaned.rows)
}

/**
 * Reconstitutes a record's untouched `rawTable` (`NormalizedTable`, plain
 * pre-Arquero rows) back into a live Arquero `ColumnTable` — same
 * `aq.from(rows)` construction as `hydrateCleanedTable`, just from the raw
 * side of the record. Needed by `rerunAnalysis` (Phase 10, Milestone 10.3):
 * a genuine "start over" must re-derive the cleaning plan and cleaned table
 * from the true raw parse, not from whatever `cleanedTable` currently holds
 * (which, once cleaning has run once, is no longer the raw data).
 */
export function hydrateRawTable(rawTable: NormalizedTable): aq.ColumnTable {
  return aq.from(rawTable.rows)
}

/**
 * The four Phase 3 analysis outputs, i.e. everything `AnalysisResult`
 * carries except `table` (superseded by `CleanedTable` above) and `meta`
 * (superseded by `rawTable` on `PersistedDataset`).
 *
 * Phase 10, Milestone 10.3: `structural` is computed once, synchronously, at
 * upload time against the RAW table, and never recomputed — only
 * `numeric`/`quality`/`dates` move to run against the cleaned table, per the
 * roadmap's explicit scoping (structural analysis stays "raw"). Until the
 * pipeline's `eda` step actually runs, `numeric`/`quality`/`dates` hold
 * harmless empty placeholders (see `emptyEdaResult` in `runPipeline.ts`) —
 * never raw-table numbers — so the UI is either honestly "not analyzed yet"
 * or showing the real post-clean result, never a stale raw-parse artifact.
 */
export interface PersistedAnalysis {
  structural: StructuralAnalysis
  numeric: NumericColumnAnalysis[]
  quality: DataQualityReport
  dates: DateColumnAnalysis[]
}

/** Lifecycle of one pipeline step's output within a persisted record — LLM or not. */
export type StepStatus = 'pending' | 'running' | 'done' | 'error'

/** Back-compat alias — same lifecycle, `LlmOutputSlot`'s original name for it. */
export type LlmOutputStatus = StepStatus

/**
 * One pipeline step's output slot, generic over its `data` shape so the same
 * resumable status-tracking shape (Phase 8's original `LlmOutputSlot`
 * pattern) covers both the four LLM-generated display outputs and Phase 10's
 * new non-LLM steps (`cleaning`, `eda`), which don't produce `InsightGroup`s
 * but still need "did this already finish" tracked durably for resume.
 */
export interface StepSlot<T> {
  status: StepStatus
  data: T | null
  errorMessage?: string
}

/**
 * One LLM output slot. `data` is `InsightGroup` for single-group outputs
 * (data dictionary, explanation) and `InsightGroup[]` for outputs that can
 * render as multiple groups (business insights, which bundles KPIs,
 * insights, and recommendations; client questions). Kept generic across
 * both shapes since the exact per-output cardinality is a Phase 4/9 UI
 * concern, not a storage concern.
 */
export type LlmOutputSlot = StepSlot<InsightGroup | InsightGroup[]>

/** Generic factory for a fresh, `pending` step slot of any shape. */
export function pendingStepSlot<T>(): StepSlot<T> {
  return { status: 'pending', data: null }
}

/** Convenience factory for a fresh record's four LLM slots, all `pending`. */
export function createPendingLlmOutputs(): PersistedDataset['llmOutputs'] {
  return {
    dataDictionary: pendingStepSlot(),
    businessInsights: pendingStepSlot(),
    explanation: pendingStepSlot(),
    clientQuestions: pendingStepSlot(),
  }
}

/**
 * Convenience factory for a fresh record's three Phase 10 non-LLM-slot-name
 * fields (`cleaningPlan`, `cleaning`, `eda`), all `pending` — paired with
 * `createPendingLlmOutputs` at record-creation time (Milestone 10.1-10.3).
 */
export function createPendingPipelineExtras(): Pick<
  PersistedDataset,
  'cleaningPlan' | 'cleaning' | 'eda'
> {
  return {
    cleaningPlan: pendingStepSlot<CleaningPlan>(),
    cleaning: pendingStepSlot<AuditTrail>(),
    eda: pendingStepSlot<null>(),
  }
}

/**
 * `true` if any pipeline step — the four LLM outputs or Phase 10's
 * `cleaningPlan`/`cleaning`/`eda` — hasn't finished yet. Used to decide
 * whether a loaded/just-created dataset needs `runPipeline` invoked
 * (fresh-upload auto-trigger, or resume-on-reload).
 */
export function isDatasetPipelineIncomplete(
  record: Pick<PersistedDataset, 'cleaningPlan' | 'cleaning' | 'eda' | 'llmOutputs'>,
): boolean {
  return (
    record.cleaningPlan.status !== 'done' ||
    record.cleaning.status !== 'done' ||
    record.eda.status !== 'done' ||
    Object.values(record.llmOutputs).some((slot) => slot.status !== 'done')
  )
}

/**
 * The full durable record for one uploaded dataset — everything needed to
 * restore the app to the state it was in right after upload + analysis +
 * LLM generation, without re-parsing the file or re-calling any LLM.
 */
export interface PersistedDataset {
  /** Stable identifier, generated at upload time (see `src/lib/storage/db.ts`). */
  id: string
  fileName: string
  /** `Date.now()` captured when the upload/processing started. */
  uploadedAt: number
  /** The untouched parse — pre-Arquero, pre-normalization — for the raw-vs-cleaned comparison view (Phase 6 spec). */
  rawTable: NormalizedTable
  /**
   * The cleaned/normalized table, serialized as plain data (see
   * `CleanedTable`). Phase 10, Milestone 10.3: genuinely reflects
   * `applyCleaningPlan`'s output once the `cleaning` step below finishes —
   * before that (record just created, `cleaning.status !== 'done'`), it's an
   * honest placeholder identical to `rawTable` (no cleaning has happened
   * yet), never a silently-stale "cleaned" table that was never cleaned.
   */
  cleanedTable: CleanedTable
  /** Phase 3's four analysis passes — `numeric`/`quality`/`dates` now run against the cleaned table (see `PersistedAnalysis`'s doc comment). */
  analysis: PersistedAnalysis
  /**
   * Phase 10, Milestone 10.1's LLM-authored cleaning plan (`generateCleaningPlan`,
   * `src/lib/llm/cleaningPlan.ts`) — the `cleaning` step below mechanically
   * applies this to `rawTable` to produce `cleanedTable`. Runs concurrently
   * with `llmOutputs.dataDictionary`, both consuming the same raw
   * structural/quality context.
   */
  cleaningPlan: StepSlot<CleaningPlan>
  /**
   * Phase 10, Milestone 10.2's ETL-apply step: status plus the resulting
   * audit trail (every applied/skipped change, Milestone 10.5's display
   * source). The actual resulting table lives in `cleanedTable` above, not
   * duplicated here — this slot's `data` is only the audit trail.
   */
  cleaning: StepSlot<AuditTrail>
  /**
   * Phase 10, Milestone 10.3's post-clean EDA step marker. The real
   * `numeric`/`quality`/`dates` results live in `analysis` above (not
   * duplicated here) — this slot exists purely so resume-on-reload can tell
   * whether that recompute has actually happened yet, distinguishing "not
   * run yet" from "ran and found nothing." `data` is always `null`.
   */
  eda: StepSlot<null>
  /** The four LLM-generated display outputs, each independently resumable. */
  llmOutputs: {
    dataDictionary: LlmOutputSlot
    businessInsights: LlmOutputSlot
    explanation: LlmOutputSlot
    clientQuestions: LlmOutputSlot
  }
}

/**
 * `LlmOutputSlot.data` decode/encode helpers for the two slot shapes, kept in
 * this one place (per Phase 8, Milestone 8.3's note) so `runPipeline.ts`,
 * `MainViewport.tsx`, `BusinessInsightsPanel.tsx`, and `TopBar.tsx` never
 * re-implement the same array-unpacking convention independently and risk
 * drifting apart.
 */

/** Narrows a slot's `data` to a single `InsightGroup`, for slots that never hold an array (`dataDictionary`, `explanation`). */
export function asSingleGroup(slot: LlmOutputSlot): InsightGroup | null {
  return slot.status === 'done' && slot.data && !Array.isArray(slot.data)
    ? slot.data
    : null
}

/**
 * Reconstructs `BusinessInsightsResult` from the `businessInsights` slot's
 * stored `[kpis, insights, recommendations]` positional array (the encoding
 * `businessInsightsToSlotData` below produces), or `null` if the slot isn't
 * `'done'` or the shape doesn't match.
 */
export function asBusinessInsights(slot: LlmOutputSlot): BusinessInsightsResult | null {
  if (slot.status !== 'done' || !Array.isArray(slot.data)) return null
  const [kpis, insights, recommendations] = slot.data
  if (!kpis || !insights || !recommendations) return null
  return { kpis, insights, recommendations }
}

/** Encodes a `BusinessInsightsResult` into the positional array shape the `businessInsights` slot stores. */
export function businessInsightsToSlotData(result: BusinessInsightsResult): InsightGroup[] {
  return [result.kpis, result.insights, result.recommendations]
}

/** Lightweight summary used for the History sidebar (Milestone 6.2) — avoids loading full table/analysis payloads just to render a list. */
export interface PersistedDatasetSummary {
  id: string
  fileName: string
  uploadedAt: number
}
