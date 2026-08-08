/**
 * Shared types for the file upload feature.
 */
import type * as aq from 'arquero'
import type { NormalizedTable } from './parsedTable'
import type { StructuralAnalysis } from '../lib/analysis/structural'
import type { NumericColumnAnalysis } from '../lib/analysis/numeric'
import type { DataQualityReport } from '../lib/analysis/quality'
import type { DateColumnAnalysis } from '../lib/analysis/dates'

/** Lifecycle states for a file upload attempt. */
export type UploadStatus = 'idle' | 'processing' | 'success' | 'error'

/**
 * Full result of running the real parsing + Phase 3 analysis pipeline
 * (`useFileUpload`) against an uploaded file: the Arquero table itself, the
 * normalization metadata behind it, all four Phase 3 analysis results, and
 * the moment processing started (captured once, at the start of
 * `processing`, since nothing else tracks an upload timestamp).
 */
export interface AnalysisResult {
  /** The parsed data as an Arquero `ColumnTable`. */
  table: aq.ColumnTable
  /** Normalized parser metadata (source format, sheet/schema info, etc). */
  meta: NormalizedTable
  /** Milestone 3.1 — column metadata and dataset-level stats. */
  structural: StructuralAnalysis
  /** Milestone 3.2 — descriptive stats and outliers per numeric column. */
  numeric: NumericColumnAnalysis[]
  /** Milestone 3.3 — missing values, duplicates, categorical/type quality checks. */
  quality: DataQualityReport
  /** Milestone 3.4 — detected date columns, ranges, and flagged dates. */
  dates: DateColumnAnalysis[]
  /** `Date.now()` captured when processing started for this file. */
  uploadedAt: number
}

/** Snapshot of the upload state machine at a point in time. */
export interface UploadState {
  status: UploadStatus
  file: File | null
  errorMessage: string | null
  /** Populated once `status === 'success'`; `null` otherwise. */
  analysis: AnalysisResult | null
}
