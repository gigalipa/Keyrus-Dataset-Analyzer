/**
 * Chained context pipeline runner — Phase 8, Milestone 8.1.
 *
 * Replaces the Phase 4-7 model where `DataDictionaryPanel` auto-triggered
 * itself on mount and `BusinessInsightsPanel`/`ClientQuestionsPanel` waited
 * for a manual "Generate" click, each independent of the others. Per
 * `docs/beyond-MVP.md`'s Phase 8 spec, all four LLM steps now run
 * automatically, in a fixed order, each one receiving the previous steps'
 * (condensed) output as chained context:
 *
 *   dataDictionary -> businessInsights -> explanation -> clientQuestions
 *
 * This module is pure orchestration — no IndexedDB import, no React. The
 * caller (`useDatasetSession`) is responsible for persistence and for
 * mirroring progress into view state; it does so via the `onStepUpdate`
 * callback, which fires synchronously right before a step starts and again
 * when it settles. Keeping storage/UI concerns out of this file keeps it
 * independently testable and keeps the "what order do steps run in, what
 * context do they chain" logic in exactly one place.
 *
 * ## Resume behavior
 *
 * `llmOutputs` (the current persisted state of all four slots) is consulted
 * to decide which steps to (re-)run: a step already `'done'` is skipped, but
 * its `data` is still used as chained context for later steps — this is what
 * makes "tab closed mid-pipeline, reload resumes" (rather than re-running
 * from scratch) possible. `'pending'`, `'error'`, and `'running'` all mean
 * "needs a fresh run" — `'running'` included, since an in-flight call from a
 * previous page load can't actually be resumed; it just gets retried like
 * any other unfinished step.
 *
 * ## Failure behavior
 *
 * If a step's LLM call throws, the pipeline reports that step as `'error'`
 * and stops — later steps are never attempted, since each one depends on
 * its predecessors' output as chained context. Earlier, already-`'done'`
 * steps are left untouched (this function never emits an update for a step
 * it didn't itself just run).
 */
import type * as aq from 'arquero'
import type { StructuralAnalysis } from '../analysis/structural'
import type { DataQualityReport } from '../analysis/quality'
import type { PersistedDataset, LlmOutputSlot } from '../../types/persistedDataset'
import { asSingleGroup, asBusinessInsights, businessInsightsToSlotData } from '../../types/persistedDataset'
import type { InsightGroup } from '../llm/schema'
import type { DatasetAnalysisSummary } from '../llm/analysisSummary'
import type { BusinessInsightsResult } from '../llm/businessInsights'
import { buildAnalysisSummary } from '../llm/analysisSummary'
import { generateDataDictionary } from '../llm/dataDictionary'
import { generateBusinessInsights } from '../llm/businessInsights'
import { generateExplanation } from '../llm/explanation'
import { generateClientQuestions } from '../llm/clientQuestions'
import { toLlmError } from '../llm/errors'

export type PipelineStepName =
  | 'dataDictionary'
  | 'businessInsights'
  | 'explanation'
  | 'clientQuestions'

/** Fixed run order — each step's chained context depends on everything before it. */
const STEP_ORDER: PipelineStepName[] = [
  'dataDictionary',
  'businessInsights',
  'explanation',
  'clientQuestions',
]

export interface RunPipelineParams {
  table: aq.ColumnTable
  file: File
  structural: StructuralAnalysis
  quality: DataQualityReport
  datasetName?: string
  /** Current state of all four slots — used to skip already-`'done'` steps (resume) and as chained context for later steps. */
  llmOutputs: PersistedDataset['llmOutputs']
  signal?: AbortSignal
  /** Fired synchronously right before a step starts (`status: 'running'`) and again when it settles (`'done'` with `data`, or `'error'` with `errorMessage`). The caller persists + updates view state here. */
  onStepUpdate: (step: PipelineStepName, slot: LlmOutputSlot) => void
}

/**
 * Runs the four-step chained-context pipeline for one dataset, skipping
 * steps already marked `'done'` in `llmOutputs` but still using their data as
 * context for later steps. Stops immediately on the first failure, having
 * already reported that step's `'error'` status via `onStepUpdate`.
 */
export async function runPipeline(params: RunPipelineParams): Promise<void> {
  const { table, file, structural, quality, datasetName, llmOutputs, signal, onStepUpdate } =
    params
  const name = datasetName ?? file.name

  // Seed chained-context state from whatever's already `'done'`, so skipped
  // steps still contribute their output to later ones.
  let dictionary: InsightGroup | null = asSingleGroup(llmOutputs.dataDictionary)
  let businessInsights: BusinessInsightsResult | null = asBusinessInsights(
    llmOutputs.businessInsights,
  )
  let explanation: InsightGroup | null = asSingleGroup(llmOutputs.explanation)

  // Computed lazily and once, only if some step actually needs it.
  let summary: DatasetAnalysisSummary | null = null
  const getSummary = (): DatasetAnalysisSummary => {
    if (!summary) summary = buildAnalysisSummary(table, file)
    return summary
  }

  for (const step of STEP_ORDER) {
    if (llmOutputs[step].status === 'done') continue

    onStepUpdate(step, { status: 'running', data: null })

    try {
      switch (step) {
        case 'dataDictionary': {
          const data = await generateDataDictionary({
            analysis: structural,
            datasetName: name,
            signal,
          })
          dictionary = data
          onStepUpdate(step, { status: 'done', data })
          break
        }
        case 'businessInsights': {
          const result = await generateBusinessInsights(getSummary(), {
            signal,
            dictionary: dictionary ?? undefined,
          })
          businessInsights = result
          onStepUpdate(step, {
            status: 'done',
            data: businessInsightsToSlotData(result),
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
          onStepUpdate(step, { status: 'done', data })
          break
        }
        case 'clientQuestions': {
          const data = await generateClientQuestions(structural.columns, quality, {
            signal,
            dictionary: dictionary ?? undefined,
            businessInsights: businessInsights ?? undefined,
            explanation: explanation ?? undefined,
          })
          onStepUpdate(step, { status: 'done', data })
          break
        }
      }
    } catch (error) {
      const llmError = toLlmError(error)
      onStepUpdate(step, {
        status: 'error',
        data: null,
        errorMessage: llmError.userMessage,
      })
      return
    }
  }
}
