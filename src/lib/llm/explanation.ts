/**
 * Business explanation generation — Phase 8, Milestone 8.1 (with its
 * display component landing later, in Phase 9's Explanation section).
 * Per `docs/beyond-MVP.md`: "a simple yet comprehensive explanation of the
 * information extracted from the dataset, such as Business model, business
 * health status, what's good, and the most important points to consider in
 * order to improve." Modeled as a single-item `InsightGroup` (`type:
 * 'explanation'`, exactly one item whose `description` holds the full
 * narrative) so it goes through the same schema validation, persistence,
 * and prompt-scaffolding path as every other structured-output call rather
 * than inventing a bespoke shape for one text blob.
 *
 * This is the third step in the automated pipeline (dictionary -> business
 * insights -> explanation -> client questions): it receives both prior
 * outputs, condensed, as chained context — per the roadmap's explicit
 * done-when for this milestone ("the explanation prompt includes both").
 */
import { runStructuredInsightRequest } from './client'
import { callMistralRawText } from './mistral'
import {
  buildSystemPrompt,
  condenseInsightGroupForContext,
  formatDatasetContext,
  formatInsightGroupInstruction,
} from './prompt'
import type { InsightGroup } from './schema'
import type { DatasetAnalysisSummary } from './analysisSummary'
import type { BusinessInsightsResult } from './businessInsights'

const TASK_INSTRUCTIONS = [
  'Task: write one comprehensive, plain-language explanation of this',
  "business, grounded in the dataset and the analysis already produced.",
  'Cover, in flowing prose (not bullet points): what the business model',
  'appears to be, the overall business health status, what looks good, and',
  'the most important points to consider in order to improve. Write for a',
  "client's non-technical stakeholder — someone who does not know what a",
  '"null value" is — who should come away understanding their business',
  'better, not just their data.',
  '',
  'Return exactly one item. Put the full narrative in that item\'s',
  '"description" (several sentences to a few short paragraphs is fine);',
  'use "title" for a short headline summarizing the business at a glance.',
].join('\n')

export interface GenerateExplanationParams {
  summary: DatasetAnalysisSummary
  /** The pipeline's already-generated data dictionary — chained context. */
  dictionary: InsightGroup
  /** The pipeline's already-generated KPIs/insights/recommendations — chained context. */
  businessInsights: BusinessInsightsResult
  datasetName?: string
  signal?: AbortSignal
}

function buildUserContent(params: GenerateExplanationParams): string {
  const { summary, dictionary, businessInsights, datasetName } = params

  const context = formatDatasetContext('Dataset context', {
    datasetName: datasetName ?? 'unknown',
    totalRows: summary.totalRows,
    totalColumns: summary.totalColumns,
    qualityHighlights: summary.qualityHighlights,
    numericHighlights: summary.numericHighlights,
    dateHighlights: summary.dateHighlights,
    dataDictionary: condenseInsightGroupForContext(dictionary),
    kpis: condenseInsightGroupForContext(businessInsights.kpis),
    businessInsightsFindings: condenseInsightGroupForContext(
      businessInsights.insights,
    ),
    recommendations: condenseInsightGroupForContext(
      businessInsights.recommendations,
    ),
  })

  return [context, '', formatInsightGroupInstruction('explanation')].join('\n')
}

/**
 * Generates the business explanation: a schema-conformant, single-item
 * `InsightGroup` of `type: 'explanation'`. Calls Mistral (the data-analysis
 * provider), consistent with the data dictionary and business insights
 * steps earlier in the same chained pipeline.
 */
export async function generateExplanation(
  params: GenerateExplanationParams,
): Promise<InsightGroup> {
  const systemPrompt = buildSystemPrompt(TASK_INSTRUCTIONS)
  const userContent = buildUserContent(params)

  return runStructuredInsightRequest({
    type: 'explanation',
    systemPrompt,
    userContent,
    callProvider: callMistralRawText,
    signal: params.signal,
  })
}
