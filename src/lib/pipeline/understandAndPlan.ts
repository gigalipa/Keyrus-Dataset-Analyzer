/**
 * "Understand & Plan Cleaning" step — Phase 10, Milestone 10.1; changed from
 * concurrent to sequential post-roadmap (see below) so the cleaning plan can
 * use the dictionary's business-meaning descriptions to make better cleaning
 * decisions (e.g. not dropping rows for a column the dictionary says is
 * genuinely optional).
 *
 * The two calls originally ran concurrently via `Promise.all`, both
 * consuming the same raw structural/quality context, purely for latency
 * (mirroring how `generateBusinessInsights` runs its three independent calls
 * concurrently). That's no longer possible once the cleaning plan depends on
 * the dictionary's *output*, not just the same input — so this now awaits
 * the dictionary first and passes it into `generateCleaningPlan`. The
 * tradeoff is real and deliberate: this step's wall-clock time grows by
 * roughly the dictionary call's own duration, in exchange for cleaning
 * decisions grounded in what each column actually means, not just its name
 * and raw sample values. `runPipeline.ts`'s status tracking is unaffected —
 * both steps still report `'running'` together and `'done'` together, this
 * function's *internal* execution order is the only thing that changed.
 *
 * This is intentionally kept as its own small orchestration function rather
 * than wired directly into `runPipeline.ts`'s `STEP_ORDER`: Milestone 10.3
 * owns reordering the full pipeline around cleaning (repositioning this step
 * before the ETL engine and post-clean EDA, updating `useDatasetSession`'s
 * persistence shape, etc.), and doing that here risks conflicting with that
 * later work. `runUnderstandAndPlan` is written so Milestone 10.3 can drop
 * it into `runPipeline.ts` as the pipeline's new first step with minimal
 * changes.
 */
import type * as aq from 'arquero'
import type { StructuralAnalysis } from '../analysis/structural'
import type { DataQualityReport } from '../analysis/quality'
import type { InsightGroup } from '../llm/schema'
import type { CleaningPlan } from '../llm/cleaningPlan'
import { generateDataDictionary } from '../llm/dataDictionary'
import { generateCleaningPlan } from '../llm/cleaningPlan'

export interface UnderstandAndPlanResult {
  dictionary: InsightGroup
  cleaningPlan: CleaningPlan
}

export interface RunUnderstandAndPlanParams {
  /** Kept for signature symmetry with `runPipeline.ts`'s other steps and future use (e.g. re-deriving context); not read directly here since `structural`/`quality` already carry everything both calls need. */
  table: aq.ColumnTable
  file: File
  /** Phase 3's structural analysis, run against the RAW (uncleaned) table. */
  structural: StructuralAnalysis
  /** A first-pass quality scan run once against the RAW table — informs the cleaning plan only, not the final post-clean EDA (Milestone 10.3 runs that separately, after the ETL engine). */
  quality: DataQualityReport
  datasetName?: string
  signal?: AbortSignal
}

/**
 * Runs the data dictionary call, then the cleaning-plan call with the
 * dictionary's result passed in as context — see the module doc for why this
 * is sequential rather than the original concurrent `Promise.all`. Rejects
 * with whichever call's `LlmError` (or plain `Error`, for the dictionary's
 * empty-columns case) fails; if the dictionary call itself fails, the
 * cleaning-plan call is never attempted, since it now depends on the
 * dictionary's output.
 */
export async function runUnderstandAndPlan(
  params: RunUnderstandAndPlanParams,
): Promise<UnderstandAndPlanResult> {
  const { structural, quality, datasetName, signal } = params

  const dictionary = await generateDataDictionary({
    analysis: structural,
    datasetName,
    signal,
  })
  const cleaningPlan = await generateCleaningPlan({
    structural,
    quality,
    dictionary,
    datasetName,
    signal,
  })

  return { dictionary, cleaningPlan }
}
