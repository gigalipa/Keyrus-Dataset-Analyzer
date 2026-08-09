/**
 * Business insights generation — Phase 4, Milestone 4.3. Builds the three
 * prompt templates (KPIs, insights, recommendations) and runs the three
 * `runStructuredInsightRequest` calls concurrently (`Promise.all`, since
 * they're independent of one another) against Mistral, per the roadmap's
 * Provider line for this milestone. Consumes a `DatasetAnalysisSummary`
 * (`analysisSummary.ts`) as its data foundation rather than raw table
 * data, keeping the prompt compact and consistent with what Milestone 4.1's
 * `formatDatasetContext` expects.
 */
import { callMistralRawText } from './mistral'
import { runStructuredInsightRequest } from './client'
import {
  buildSystemPrompt,
  condenseInsightGroupForContext,
  formatDatasetContext,
  formatInsightGroupInstruction,
} from './prompt'
import type { InsightGroup } from './schema'
import type { DatasetAnalysisSummary } from './analysisSummary'

/** The three `InsightGroup`s this milestone produces, one per structured-output call. */
export interface BusinessInsightsResult {
  kpis: InsightGroup
  insights: InsightGroup
  recommendations: InsightGroup
}

const TASK_INSTRUCTIONS: Record<'kpi' | 'insight' | 'recommendation', string> =
  {
    kpi: [
      'Task: Propose Key Performance Indicators (KPIs) a business could track',
      'from this dataset. Each KPI should be a concrete, measurable metric',
      '(e.g. total revenue, average order value, on-time delivery rate) that',
      'is plausible given the columns and statistics provided — do not invent',
      'metrics the data cannot support. Where possible, put a computed or',
      'estimated numeric value and unit in `metadata` (e.g.',
      '`{ "value": 1234.56, "unit": "USD" }`), so the UI can render it as a',
      'metric card; if a precise value cannot be derived from the summary,',
      'omit `metadata` and describe the KPI qualitatively instead.',
      'Tag each item with its business domain (e.g. "revenue", "operations",',
      '"data-quality", "customer") so the UI can filter by domain.',
      '',
      'Do NOT propose data-profile statistics as KPIs — e.g. row count,',
      'column count, missing-value count/percentage, file size, or other',
      'structural/quality metrics about the dataset itself. Those already',
      'have their own dedicated Data Overview and Data Quality sections',
      'elsewhere in the app. A KPI here must describe what the data implies',
      'about the business (revenue, operations, customers, growth, risk,',
      'etc.), not a fact about the dataset as a file.',
    ].join('\n'),
    insight: [
      'Task: Surface concrete insights about this dataset — patterns, trends,',
      'notable outliers, data quality concerns, or relationships between',
      'columns that a consultant should call out to a client. Ground every',
      'insight in the provided column descriptions, quality highlights, or',
      'statistical highlights; do not speculate beyond what the summary',
      'supports.',
      'Tag each item with its business domain (e.g. "revenue",',
      '"data-quality", "operations", "customer") and, where relevant, a',
      '`priority` reflecting confidence/severity.',
    ].join('\n'),
    recommendation: [
      'Task: Recommend concrete next steps or actions the client should take',
      'based on the insights and data quality issues in the dataset — e.g.',
      'data cleanup steps, process changes, or areas to investigate further.',
      'Each recommendation should be actionable and specific to what the data',
      'shows, not generic advice.',
      'Tag each item with its business domain (e.g. "revenue",',
      '"data-quality", "operations") and set `priority` to reflect urgency.',
    ].join('\n'),
  }

/** Builds the system prompt for one of the three business-insights calls. */
function buildBusinessInsightsSystemPrompt(
  type: 'kpi' | 'insight' | 'recommendation',
): string {
  return buildSystemPrompt(
    [TASK_INSTRUCTIONS[type], '', formatInsightGroupInstruction(type)].join(
      '\n',
    ),
  )
}

/**
 * Builds the user message: the condensed dataset analysis summary as
 * context, plus — Phase 8, Milestone 8.1's chaining requirement — the
 * already-generated data dictionary, condensed, when the pipeline has one
 * available. Manual, standalone calls to this function (e.g. before the
 * pipeline existed) simply omit `dictionary` and get the Phase 4 behavior.
 */
function buildBusinessInsightsUserContent(
  summary: DatasetAnalysisSummary,
  dictionary?: InsightGroup,
): string {
  return formatDatasetContext('Dataset analysis summary', {
    ...summary,
    ...(dictionary
      ? { dataDictionary: condenseInsightGroupForContext(dictionary) }
      : {}),
  })
}

export interface GenerateBusinessInsightsOptions {
  signal?: AbortSignal
  /**
   * The pipeline's already-generated data dictionary (Phase 8, Milestone
   * 8.1), included as context so KPIs/insights/recommendations can build on
   * what the dictionary already established about each column's meaning,
   * per beyond-MVP.md's chained-pipeline requirement. Optional so this
   * function still works standalone.
   */
  dictionary?: InsightGroup
}

/**
 * Generates KPIs, insights, and recommendations for `summary` by running
 * three independent `runStructuredInsightRequest` calls against Mistral
 * concurrently. Each call validates its own response against the shared
 * `InsightGroup` schema (KPIs 2-5 items, insights 3-5, recommendations 3+)
 * and retries once on invalid JSON/schema per Milestone 4.1's client.
 * Rejects with `LlmError` if any of the three calls ultimately fails.
 */
export async function generateBusinessInsights(
  summary: DatasetAnalysisSummary,
  options: GenerateBusinessInsightsOptions = {},
): Promise<BusinessInsightsResult> {
  const userContent = buildBusinessInsightsUserContent(summary, options.dictionary)

  const [kpis, insights, recommendations] = await Promise.all([
    runStructuredInsightRequest({
      type: 'kpi',
      systemPrompt: buildBusinessInsightsSystemPrompt('kpi'),
      userContent,
      callProvider: callMistralRawText,
      signal: options.signal,
    }),
    runStructuredInsightRequest({
      type: 'insight',
      systemPrompt: buildBusinessInsightsSystemPrompt('insight'),
      userContent,
      callProvider: callMistralRawText,
      signal: options.signal,
    }),
    runStructuredInsightRequest({
      type: 'recommendation',
      systemPrompt: buildBusinessInsightsSystemPrompt('recommendation'),
      userContent,
      callProvider: callMistralRawText,
      signal: options.signal,
    }),
  ])

  return { kpis, insights, recommendations }
}
