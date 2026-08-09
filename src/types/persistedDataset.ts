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
 * The four Phase 3 analysis outputs, i.e. everything `AnalysisResult`
 * carries except `table` (superseded by `CleanedTable` above) and `meta`
 * (superseded by `rawTable` on `PersistedDataset`).
 */
export interface PersistedAnalysis {
  structural: StructuralAnalysis
  numeric: NumericColumnAnalysis[]
  quality: DataQualityReport
  dates: DateColumnAnalysis[]
}

/** Lifecycle of one LLM-generated output within a persisted record. */
export type LlmOutputStatus = 'pending' | 'running' | 'done' | 'error'

/**
 * One LLM output slot. `data` is `InsightGroup` for single-group outputs
 * (data dictionary, explanation) and `InsightGroup[]` for outputs that can
 * render as multiple groups (business insights, which bundles KPIs,
 * insights, and recommendations; client questions). Kept generic across
 * both shapes since the exact per-output cardinality is a Phase 4/9 UI
 * concern, not a storage concern.
 */
export interface LlmOutputSlot {
  status: LlmOutputStatus
  data: InsightGroup | InsightGroup[] | null
  errorMessage?: string
}

function pendingSlot(): LlmOutputSlot {
  return { status: 'pending', data: null }
}

/** Convenience factory for a fresh record's four LLM slots, all `pending`. */
export function createPendingLlmOutputs(): PersistedDataset['llmOutputs'] {
  return {
    dataDictionary: pendingSlot(),
    businessInsights: pendingSlot(),
    explanation: pendingSlot(),
    clientQuestions: pendingSlot(),
  }
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
  /** The cleaned/normalized table, serialized as plain data (see `CleanedTable`). */
  cleanedTable: CleanedTable
  /** Phase 3's four analysis passes. */
  analysis: PersistedAnalysis
  /** The three (soon four, once Phase 9 adds `explanation`) LLM-generated outputs, each independently resumable. */
  llmOutputs: {
    dataDictionary: LlmOutputSlot
    businessInsights: LlmOutputSlot
    /** Reserved for Phase 9 ("explanation" narrative); unused until then. */
    explanation: LlmOutputSlot
    clientQuestions: LlmOutputSlot
  }
}

/** Lightweight summary used for the History sidebar (Milestone 6.2) — avoids loading full table/analysis payloads just to render a list. */
export interface PersistedDatasetSummary {
  id: string
  fileName: string
  uploadedAt: number
}
