/**
 * Client questions generation — Phase 4, Milestone 4.4. Builds the strategic-
 * questions prompt (grounded in the dataset's actual columns and data-quality
 * findings from Phase 3's `analyzeDataQuality`) and runs it through
 * `runStructuredInsightRequest` (`client.ts`) against Google AI Studio
 * (Gemini), per the roadmap's Milestone 4.4 provider line — the one
 * structured-output call in Phase 4 that does NOT use the data-analysis
 * provider (Mistral) that Milestones 4.2/4.3 use.
 *
 * ## Contract
 *
 * `generateClientQuestions(columns, qualityReport)` is the single entry
 * point: given the analyzed columns (Milestone 3.1's `ColumnMetadata[]`) and
 * the data-quality report (Milestone 3.3's `DataQualityReport`), it returns
 * a schema-conformant, runtime-validated `InsightGroup` of `type: 'question'`
 * items — 2 or more strategic questions a consultant should ask the client,
 * each tagged by topic (`data-collection`, `business-context`, `process`,
 * `data-quality`, or `industry`) for the display component's filter chips.
 *
 * The prompt does three things the roadmap's "include data context" task
 * requires:
 *  - includes a best-effort industry hint, guessed from column names/values
 *    via a lightweight local heuristic (`guessIndustryHints`) — this is
 *    intentionally unsophisticated; the LLM is free to infer further from
 *    the full column list itself,
 *  - summarizes data-quality concerns pulled straight from
 *    `analyzeDataQuality`'s report (missing values, duplicate rows,
 *    inconsistent categoricals, mixed types), filtered to non-`info`
 *    findings so the prompt isn't drowned in "no issues" noise,
 *  - calls out structural gaps (columns whose inferred type is `'null'`,
 *    i.e. entirely empty) as an explicit "gaps in the data" section.
 */
import type { ColumnMetadata } from '../analysis/structural'
import type { DataQualityReport, QualityCheckResult } from '../analysis/quality'
import {
  buildSystemPrompt,
  formatDatasetContext,
  formatInsightGroupInstruction,
} from './prompt'
import { runStructuredInsightRequest } from './client'
import { callGeminiRawText } from './gemini'
import type { InsightGroup } from './schema'

/** Topic tags the prompt asks the model to use, so the display component's filter chips have a known, stable vocabulary. */
export const CLIENT_QUESTION_TOPICS = [
  'data-collection',
  'business-context',
  'process',
  'data-quality',
  'industry',
] as const

export type ClientQuestionTopic = (typeof CLIENT_QUESTION_TOPICS)[number]

/**
 * Lightweight, best-effort industry guess from column names — not a real
 * classifier, just enough of a nudge to ground the prompt. The LLM is told
 * this is a guess and encouraged to infer further from the full column list
 * and sample values itself.
 */
const INDUSTRY_KEYWORD_HINTS: Array<{ industry: string; keywords: RegExp }> = [
  {
    industry: 'retail / e-commerce',
    keywords: /sku|product|inventory|order|cart|price|discount|customer/i,
  },
  {
    industry: 'healthcare',
    keywords: /patient|diagnos|treatment|clinician|prescri|icd|admission/i,
  },
  {
    industry: 'finance / banking',
    keywords:
      /account|transaction|balance|invoice|payment|loan|interest|currency/i,
  },
  {
    industry: 'human resources',
    keywords: /employee|salary|hire|department|manager|payroll|headcount/i,
  },
  {
    industry: 'logistics / supply chain',
    keywords: /shipment|warehouse|carrier|tracking|freight|route|delivery/i,
  },
  {
    industry: 'marketing / sales',
    keywords:
      /campaign|lead|conversion|impression|click|revenue|deal|opportunity/i,
  },
]

/** Best-effort industry hints inferred from column names, for the prompt's data-context section. */
export function guessIndustryHints(columns: ColumnMetadata[]): string[] {
  const names = columns.map((c) => c.name).join(' ')
  return INDUSTRY_KEYWORD_HINTS.filter((hint) => hint.keywords.test(names)).map(
    (hint) => hint.industry,
  )
}

/** Non-`info` quality findings only — the prompt should surface real concerns, not clutter with "no issues found" entries. */
function notableQualityFindings(
  results: QualityCheckResult[],
): QualityCheckResult[] {
  return results.filter((r) => r.severity !== 'info' && r.count > 0)
}

/** Summarizes `qualityReport` down to the findings worth putting in front of the LLM (and worth a consultant's attention). */
function summarizeQualityConcerns(report: DataQualityReport): Array<{
  checkName: string
  description: string
  severity: string
  affectedColumns: string[]
}> {
  const all = [
    ...notableQualityFindings(report.missingValues),
    ...notableQualityFindings([report.duplicateRows]),
    ...notableQualityFindings(report.inconsistentCategoricals),
    ...notableQualityFindings(report.mixedTypes),
  ]
  return all.map((r) => ({
    checkName: r.checkName,
    description: r.description,
    severity: r.severity,
    affectedColumns: r.affectedColumns,
  }))
}

/** Columns whose inferred type is `'null'` (entirely empty) — a structural "gap" worth asking the client about. */
function findStructuralGaps(columns: ColumnMetadata[]): string[] {
  return columns
    .filter((c) => c.dataType === 'null')
    .map((c) => `Column "${c.name}" has no non-empty sample values.`)
}

const TASK_INSTRUCTIONS = [
  'Task: propose strategic questions a data consultant should ask the',
  'client about their dataset, before finalizing an analysis. These are',
  "dialogue starters for a conversation with the client's stakeholders —",
  'not questions the data itself can answer.',
  '',
  'Ground every question in the actual dataset context provided below',
  '(columns, industry hints, data-quality concerns, structural gaps).',
  'Prefer specific questions over generic ones (e.g. reference a column',
  'name or a specific quality concern where relevant).',
  '',
  `Tag each question with exactly one topic from this fixed set: ${CLIENT_QUESTION_TOPICS.join(', ')}.`,
  '- "data-collection": how/where/how often the data is collected or sourced.',
  '- "business-context": what the data means for the business, definitions, goals.',
  '- "process": the workflows or systems that produce or consume this data.',
  '- "data-quality": questions motivated by a specific quality concern below.',
  '- "industry": questions motivated by the inferred industry context.',
  '',
  'Cover a mix of topics rather than clustering on just one.',
].join('\n')

/**
 * Builds the user-message content for a client-questions request: dataset
 * context (columns, industry hints, quality concerns, structural gaps)
 * followed by the JSON-shape instruction for `type: 'question'`.
 */
function buildUserContent(
  columns: ColumnMetadata[],
  qualityReport: DataQualityReport,
): string {
  const industryHints = guessIndustryHints(columns)
  const qualityConcerns = summarizeQualityConcerns(qualityReport)
  const structuralGaps = findStructuralGaps(columns)

  const context = formatDatasetContext('Dataset context', {
    columns: columns.map((c) => ({
      name: c.name,
      dataType: c.dataType,
      sampleValues: c.sampleValues,
    })),
    industryHints:
      industryHints.length > 0
        ? industryHints
        : [
            'No industry could be confidently inferred from column names alone — infer from the data below if possible.',
          ],
    dataQualityConcerns:
      qualityConcerns.length > 0
        ? qualityConcerns
        : ['No notable data-quality concerns were detected.'],
    gapsInTheData:
      structuralGaps.length > 0
        ? structuralGaps
        : ['No entirely-empty columns detected.'],
  })

  return [context, '', formatInsightGroupInstruction('question')].join('\n')
}

/**
 * Generates the client-questions `InsightGroup`: a schema-conformant,
 * runtime-validated set of 2+ strategic questions tagged by topic, grounded
 * in `columns` and `qualityReport`. Calls Google AI Studio (Gemini) via
 * `callGeminiRawText`, per the roadmap's Milestone 4.4 provider line.
 */
export async function generateClientQuestions(
  columns: ColumnMetadata[],
  qualityReport: DataQualityReport,
  signal?: AbortSignal,
): Promise<InsightGroup> {
  const systemPrompt = buildSystemPrompt(TASK_INSTRUCTIONS)
  const userContent = buildUserContent(columns, qualityReport)

  return runStructuredInsightRequest({
    type: 'question',
    systemPrompt,
    userContent,
    callProvider: callGeminiRawText,
    signal,
  })
}
