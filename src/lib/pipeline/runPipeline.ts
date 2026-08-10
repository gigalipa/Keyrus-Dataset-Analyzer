/**
 * Chained context pipeline runner — Phase 8, Milestone 8.1; reordered around
 * real cleaning in Phase 10, Milestone 10.3.
 *
 * Replaces the Phase 4-7 model where `DataDictionaryPanel` auto-triggered
 * itself on mount and `BusinessInsightsPanel`/`ClientQuestionsPanel` waited
 * for a manual "Generate" click, each independent of the others. Per
 * `docs/beyond-MVP.md`'s Phase 8 spec, every step now runs automatically, in
 * a fixed order, each one receiving the previous steps' (condensed) output as
 * chained context. Phase 10 extended that fixed order to put real cleaning
 * ahead of EDA, per the roadmap's resolved architecture:
 *
 *   dataDictionary + planCleaning (concurrent)
 *     -> clean (ETL apply)
 *     -> eda (numeric/quality/dates on the now-cleaned table)
 *     -> businessInsights -> explanation -> clientQuestions
 *
 * `dataDictionary` and `planCleaning` are Milestone 10.1's pairing: both
 * consume the same raw structural/quality context and are kicked off
 * together via `runUnderstandAndPlan` (mirroring how `generateBusinessInsights`
 * already runs its three calls concurrently) whenever either hasn't finished
 * yet. They always complete together (a single `Promise.all` under the
 * hood), so on resume either both are `'done'` or neither is — there's no
 * "only one of the two" state this pipeline needs to reconcile.
 *
 * `clean` (Milestone 10.2) and `eda` (Milestone 10.3) are **not** LLM calls —
 * `applyCleaningPlan` and `analyzeNumericColumns`/`analyzeDataQuality`/
 * `analyzeDateColumns` are pure, synchronous, and fast — but they still get
 * their own `PipelineStepName` entries with the same resumable `StepSlot`
 * status tracking as the LLM steps, so "tab closed right after cleaning
 * finished but before EDA ran" resumes by running only `eda`, not re-cleaning
 * or re-planning.
 *
 * This module is pure orchestration — no IndexedDB import, no React. The
 * caller (`useDatasetSession`) is responsible for persistence and for
 * mirroring progress into view state; it does so via the `onStepUpdate`
 * callback, which fires synchronously right before a step starts and again
 * when it settles.
 *
 * ## Resume behavior
 *
 * Every step's current `StepSlot` (from the caller's persisted record) is
 * consulted to decide whether it needs to (re-)run: a step already `'done'`
 * is skipped, but its data (or, for `clean`/`eda`, the caller-supplied
 * `cleanedTable`/`analysis`) is still used as input/context for later steps —
 * this is what makes "tab closed mid-pipeline, reload resumes" possible at
 * every stage, not just the four original LLM steps. `'pending'`, `'error'`,
 * and `'running'` all mean "needs a fresh run" — `'running'` included, since
 * an in-flight call from a previous page load can't actually be resumed; it
 * just gets retried like any other unfinished step.
 *
 * ## Failure behavior
 *
 * If a step fails, the pipeline reports that step (or both, for the
 * `dataDictionary`/`planCleaning` pair) as `'error'` and stops — later steps
 * are never attempted, since each one depends on its predecessors' output.
 * Earlier, already-`'done'` steps are left untouched.
 */
import * as aq from 'arquero'
import type { StructuralAnalysis } from '../analysis/structural'
import type { NumericColumnAnalysis } from '../analysis/numeric'
import type { DataQualityReport } from '../analysis/quality'
import type { DateColumnAnalysis } from '../analysis/dates'
import { analyzeDataQuality } from '../analysis/quality'
import { analyzeNumericColumns } from '../analysis/numeric'
import { analyzeDateColumns } from '../analysis/dates'
import type { PersistedDataset, StepSlot } from '../../types/persistedDataset'
import { asSingleGroup, asBusinessInsights, businessInsightsToSlotData } from '../../types/persistedDataset'
import type { InsightGroup } from '../llm/schema'
import type { DatasetAnalysisSummary } from '../llm/analysisSummary'
import type { BusinessInsightsResult } from '../llm/businessInsights'
import type { CleaningPlan } from '../llm/cleaningPlan'
import type { AuditTrail } from '../etl/applyCleaningPlan'
import { buildAnalysisSummary } from '../llm/analysisSummary'
import { generateBusinessInsights } from '../llm/businessInsights'
import { generateExplanation } from '../llm/explanation'
import { generateClientQuestions } from '../llm/clientQuestions'
import { runUnderstandAndPlan } from './understandAndPlan'
import { applyCleaningPlan } from '../etl/applyCleaningPlan'
import { toLlmError } from '../llm/errors'

export type PipelineStepName =
  | 'dataDictionary'
  | 'planCleaning'
  | 'clean'
  | 'eda'
  | 'businessInsights'
  | 'explanation'
  | 'clientQuestions'

/** Fixed run order — each step's chained context depends on everything before it. `dataDictionary`/`planCleaning` run concurrently in practice (see module doc) but are listed as adjacent entries for status-tracking/display purposes. */
export const STEP_ORDER: PipelineStepName[] = [
  'dataDictionary',
  'planCleaning',
  'clean',
  'eda',
  'businessInsights',
  'explanation',
  'clientQuestions',
]

/** The post-clean EDA result — `analyzeNumericColumns`/`analyzeDataQuality`/`analyzeDateColumns` run against the cleaned table. */
export interface EdaResult {
  numeric: NumericColumnAnalysis[]
  quality: DataQualityReport
  dates: DateColumnAnalysis[]
}

/**
 * One step's reported update. `cleanedTable` is only ever set on the `clean`
 * step's `'done'` update (the live Arquero table the caller needs to update
 * view state/persistence with — `slot.data` alone, the audit trail, isn't
 * enough); `eda` is only ever set on the `eda` step's `'done'` update, for
 * the same reason.
 */
export interface PipelineStepUpdate {
  step: PipelineStepName
  slot: StepSlot<unknown>
  cleanedTable?: aq.ColumnTable
  eda?: EdaResult
}

export interface RunPipelineParams {
  /** The untouched raw parse — input to `planCleaning`'s pre-clean quality scan and to the `clean` step. Never mutated or reassigned mid-run. */
  rawTable: aq.ColumnTable
  file: File
  /** Phase 3's structural analysis, run once against the raw table at upload time and never recomputed (Milestone 10.3's explicit scoping). */
  structural: StructuralAnalysis
  datasetName?: string
  signal?: AbortSignal

  /** Current state of the four LLM slots — used to skip already-`'done'` steps (resume) and as chained context for later steps. */
  llmOutputs: PersistedDataset['llmOutputs']
  /** Current state of Milestone 10.1's cleaning-plan slot. */
  cleaningPlan: StepSlot<CleaningPlan>
  /** Current state of Milestone 10.2's ETL-apply slot. */
  cleaning: StepSlot<AuditTrail>
  /** Current state of Milestone 10.3's post-clean EDA marker slot. */
  eda: StepSlot<null>
  /**
   * The dataset's current best table: identical to `rawTable` if `cleaning`
   * isn't `'done'` yet, or the already-cleaned table (hydrated from storage)
   * if resuming after cleaning finished. Only read when `cleaning.status ===
   * 'done'` (otherwise the `clean` step below derives it fresh from
   * `rawTable`).
   */
  cleanedTable: aq.ColumnTable
  /**
   * The dataset's current EDA numbers: placeholders if `eda` isn't `'done'`
   * yet, or the real post-clean result if resuming after EDA finished. Only
   * read when `eda.status === 'done'` (otherwise the `eda` step below
   * derives it fresh from the cleaned table).
   */
  analysis: EdaResult

  /** Fired synchronously right before a step starts (`status: 'running'`) and again when it settles. The caller persists + updates view state here. */
  onStepUpdate: (update: PipelineStepUpdate) => void
}

/**
 * Runs the full chained-context pipeline for one dataset (Milestone 10.3's
 * reordered sequence — see module doc), skipping steps already marked
 * `'done'` but still using their persisted output as context for later
 * steps. Stops immediately on the first failure, having already reported
 * that step's `'error'` status via `onStepUpdate`.
 */
export async function runPipeline(params: RunPipelineParams): Promise<void> {
  const {
    rawTable,
    file,
    structural,
    datasetName,
    llmOutputs,
    cleaningPlan,
    cleaning,
    eda,
    cleanedTable: initialCleanedTable,
    analysis: initialAnalysis,
    signal,
    onStepUpdate,
  } = params
  const name = datasetName ?? file.name

  // Seed chained-context state from whatever's already `'done'`.
  let dictionary: InsightGroup | null = asSingleGroup(llmOutputs.dataDictionary)
  let plan: CleaningPlan | null = cleaningPlan.status === 'done' ? cleaningPlan.data : null
  let businessInsights: BusinessInsightsResult | null = asBusinessInsights(
    llmOutputs.businessInsights,
  )
  let explanation: InsightGroup | null = asSingleGroup(llmOutputs.explanation)

  // The "current best table" — raw until `clean` actually runs (or is
  // resumed as already-done), cleaned from then on. Every later step reads
  // this, never `rawTable` directly.
  let currentTable: aq.ColumnTable = cleaning.status === 'done' ? initialCleanedTable : rawTable

  // The "current best EDA" — placeholders until `eda` actually runs (or is
  // resumed as already-done).
  let currentEda: EdaResult =
    eda.status === 'done'
      ? initialAnalysis
      : { numeric: [], quality: initialAnalysis.quality, dates: [] }

  // Computed lazily and once, only if some later LLM step actually needs it
  // — always re-derives from `currentTable` (the cleaned table, once `clean`
  // has run), which is the entire point of this phase: chained-context LLM
  // steps see real cleaned-data numbers, not raw-parse artifacts.
  let summary: DatasetAnalysisSummary | null = null
  const getSummary = (): DatasetAnalysisSummary => {
    if (!summary) summary = buildAnalysisSummary(currentTable, file)
    return summary
  }

  // --- Step 1+2: dataDictionary + planCleaning (concurrent) ---------------
  if (llmOutputs.dataDictionary.status !== 'done' || cleaningPlan.status !== 'done') {
    onStepUpdate({ step: 'dataDictionary', slot: { status: 'running', data: null } })
    onStepUpdate({ step: 'planCleaning', slot: { status: 'running', data: null } })
    try {
      // A first-pass quality scan against the RAW table — informs the
      // cleaning plan only (Milestone 10.1's explicit scoping), never used
      // as final EDA output. Cheap/synchronous, so recomputed fresh here
      // rather than persisted.
      const rawQualityScan = analyzeDataQuality(rawTable, structural.columns)
      const result = await runUnderstandAndPlan({
        table: rawTable,
        file,
        structural,
        quality: rawQualityScan,
        datasetName: name,
        signal,
      })
      dictionary = result.dictionary
      plan = result.cleaningPlan
      onStepUpdate({
        step: 'dataDictionary',
        slot: { status: 'done', data: dictionary },
      })
      onStepUpdate({ step: 'planCleaning', slot: { status: 'done', data: plan } })
    } catch (error) {
      const llmError = toLlmError(error)
      onStepUpdate({
        step: 'dataDictionary',
        slot: { status: 'error', data: null, errorMessage: llmError.userMessage },
      })
      onStepUpdate({
        step: 'planCleaning',
        slot: { status: 'error', data: null, errorMessage: llmError.userMessage },
      })
      return
    }
  }

  // --- Step 3: clean (ETL apply, deterministic, non-LLM) -------------------
  if (cleaning.status !== 'done') {
    onStepUpdate({ step: 'clean', slot: { status: 'running', data: null } })
    // `plan` is guaranteed non-null here: either resumed from an already-
    // `'done'` cleaningPlan slot, or just produced by the block above (which
    // returns early on failure).
    const { cleanedTable, auditTrail } = applyCleaningPlan(rawTable, plan as CleaningPlan)
    currentTable = cleanedTable
    onStepUpdate({
      step: 'clean',
      slot: { status: 'done', data: auditTrail },
      cleanedTable,
    })
  }

  // --- Step 4: eda (numeric/quality/dates on the cleaned table) -----------
  if (eda.status !== 'done') {
    onStepUpdate({ step: 'eda', slot: { status: 'running', data: null } })
    const edaResult: EdaResult = {
      numeric: analyzeNumericColumns(currentTable, structural.columns),
      quality: analyzeDataQuality(currentTable, structural.columns),
      dates: analyzeDateColumns(currentTable, structural.columns),
    }
    currentEda = edaResult
    onStepUpdate({ step: 'eda', slot: { status: 'done', data: null }, eda: edaResult })
  }

  // --- Steps 5-7: businessInsights -> explanation -> clientQuestions ------
  for (const step of ['businessInsights', 'explanation', 'clientQuestions'] as const) {
    if (llmOutputs[step].status === 'done') continue

    onStepUpdate({ step, slot: { status: 'running', data: null } })

    try {
      switch (step) {
        case 'businessInsights': {
          const result = await generateBusinessInsights(getSummary(), {
            signal,
            dictionary: dictionary ?? undefined,
          })
          businessInsights = result
          onStepUpdate({
            step,
            slot: { status: 'done', data: businessInsightsToSlotData(result) },
          })
          break
        }
        case 'explanation': {
          if (!dictionary || !businessInsights) {
            throw new Error(
              'Cannot generate the business explanation: the data dictionary and business insights steps must complete first.',
            )
          }
          const data = await generateExplanation({
            summary: getSummary(),
            dictionary,
            businessInsights,
            datasetName: name,
            signal,
          })
          explanation = data
          onStepUpdate({ step, slot: { status: 'done', data } })
          break
        }
        case 'clientQuestions': {
          const data = await generateClientQuestions(structural.columns, currentEda.quality, {
            signal,
            dictionary: dictionary ?? undefined,
            businessInsights: businessInsights ?? undefined,
            explanation: explanation ?? undefined,
          })
          onStepUpdate({ step, slot: { status: 'done', data } })
          break
        }
      }
    } catch (error) {
      const llmError = toLlmError(error)
      onStepUpdate({
        step,
        slot: { status: 'error', data: null, errorMessage: llmError.userMessage },
      })
      return
    }
  }
}
