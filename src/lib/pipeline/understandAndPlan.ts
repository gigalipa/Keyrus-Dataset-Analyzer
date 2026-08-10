/**
 * "Understand & Plan Cleaning" step — Phase 10, Milestone 10.1. Runs the
 * (unchanged) data dictionary call and the new cleaning-plan call
 * concurrently via `Promise.all`, both consuming the same raw
 * structural/quality context — mirroring how `generateBusinessInsights`
 * already runs its three calls concurrently (`businessInsights.ts`).
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
 * Runs the data dictionary and cleaning-plan LLM calls concurrently against
 * the same raw structural/quality context, per the roadmap's "reposition
 * data dictionary to run alongside plan cleaning" requirement. Rejects with
 * whichever call's `LlmError` (or plain `Error`, for the dictionary's
 * empty-columns case) fails first.
 */
export async function runUnderstandAndPlan(
  params: RunUnderstandAndPlanParams,
): Promise<UnderstandAndPlanResult> {
  const { structural, quality, datasetName, signal } = params

  const [dictionary, cleaningPlan] = await Promise.all([
    generateDataDictionary({ analysis: structural, datasetName, signal }),
    generateCleaningPlan({ structural, quality, datasetName, signal }),
  ])

  return { dictionary, cleaningPlan }
}
