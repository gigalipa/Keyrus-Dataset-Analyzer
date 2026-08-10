/**
 * Cleaning-plan schema and generation — Phase 10, Milestone 10.1. This is a
 * deliberately *separate* contract from `schema.ts`'s `InsightGroup` — that
 * shape is display content (a title/description/tags card the UI renders),
 * while a cleaning plan is actionable ETL instructions Milestone 10.2's
 * engine mechanically applies to the raw table. Shoehorning the two together
 * would force the ETL engine to parse free-text `description` fields to
 * figure out what to actually do to the data, which is exactly the kind of
 * "needs a second LLM call to interpret" ambiguity this schema exists to
 * avoid.
 *
 * ## Contract
 *
 * A `CleaningPlan` is a list of `ColumnCleaningPlan` entries, one per column
 * the LLM decided needs cleaning (columns needing no changes are simply
 * omitted — the ETL engine leaves them untouched). Each column entry may
 * carry any combination of:
 *
 *  - `valueMappings`: an explicit `from -> to` table for categorical
 *    unification (e.g. "web"/"WEB" -> "Web"). Deterministic: the ETL engine
 *    does an exact-match replace, no fuzzy interpretation required.
 *  - `missingValuePolicy`: exactly one of three actions —
 *    `'drop-row'` (remove rows missing this column), `'fill-default'` (a
 *    stated literal replacement value), or `'leave-null'` (explicitly do
 *    nothing, with a stated reason why that's the right call) — a
 *    discriminated union so the engine never has to guess which fields are
 *    relevant for a given action.
 *  - `typeCoercion`: a single target type (`'number' | 'integer' | 'float' |
 *    'date' | 'string' | 'boolean'`) the engine coerces the column's values
 *    to.
 *
 * Every entry — every value mapping, the missing-value policy, and the type
 * coercion rule — carries its own non-empty `reason` string. Milestone 10.2's
 * audit trail quotes these verbatim as "why this changed", so an empty or
 * missing reason is a schema violation, not a display nicety.
 *
 * `parseCleaningPlan(raw)` is the single validation entry point
 * `generateCleaningPlan` (below) and any future caller use after parsing an
 * LLM response as JSON: it returns a typed, valid `CleaningPlan` or throws
 * `CleaningPlanValidationError` with zod's own issue list, mirroring
 * `schema.ts`'s `parseInsightGroup`/`InsightValidationError` pattern.
 */
import { z } from 'zod'
import { runValidatedJsonRequest } from './client'
import { callMistralRawText } from './mistral'
import { buildSystemPrompt, condenseInsightGroupForContext, formatDatasetContext } from './prompt'
import { summarizeQualityHighlights } from './analysisSummary'
import type { ColumnMetadata, StructuralAnalysis } from '../analysis/structural'
import type { DataQualityReport } from '../analysis/quality'
import type { InsightGroup } from './schema'

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

/** One explicit categorical-unification rule: replace `from` with `to`, exact match. */
export const valueMappingSchema = z.object({
  from: z.string().min(1, 'from must not be empty'),
  to: z.string().min(1, 'to must not be empty'),
  reason: z.string().min(1, 'reason must not be empty'),
})
export type ValueMapping = z.infer<typeof valueMappingSchema>

/**
 * How to handle missing (null/blank) values in this column — a discriminated
 * union on `action` so the engine only ever sees the fields relevant to the
 * chosen action (e.g. `defaultValue` only exists for `'fill-default'`).
 */
export const missingValuePolicySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('drop-row'),
    reason: z.string().min(1, 'reason must not be empty'),
  }),
  z.object({
    action: z.literal('fill-default'),
    defaultValue: z.union([z.string(), z.number(), z.boolean()]),
    reason: z.string().min(1, 'reason must not be empty'),
  }),
  z.object({
    action: z.literal('leave-null'),
    reason: z.string().min(1, 'reason must not be empty'),
  }),
])
export type MissingValuePolicy = z.infer<typeof missingValuePolicySchema>

/** Target type a column's values should be coerced to. */
export const typeCoercionTargetSchema = z.enum([
  'string',
  'integer',
  'float',
  'number',
  'date',
  'boolean',
])
export type TypeCoercionTarget = z.infer<typeof typeCoercionTargetSchema>

/** A single type-coercion rule for a column, with the target type and why. */
export const typeCoercionRuleSchema = z.object({
  targetType: typeCoercionTargetSchema,
  reason: z.string().min(1, 'reason must not be empty'),
})
export type TypeCoercionRule = z.infer<typeof typeCoercionRuleSchema>

/**
 * The full cleaning plan for one affected column. At least one of
 * `valueMappings`/`missingValuePolicy`/`typeCoercion` must be present —
 * otherwise the column shouldn't be in the plan at all (enforced by the
 * `.refine` below).
 */
export const columnCleaningPlanSchema = z
  .object({
    columnName: z.string().min(1, 'columnName must not be empty'),
    valueMappings: z.array(valueMappingSchema).default([]),
    missingValuePolicy: missingValuePolicySchema.nullable().default(null),
    typeCoercion: typeCoercionRuleSchema.nullable().default(null),
  })
  .refine(
    (plan) =>
      plan.valueMappings.length > 0 ||
      plan.missingValuePolicy !== null ||
      plan.typeCoercion !== null,
    {
      message:
        'A column cleaning plan must specify at least one of valueMappings, missingValuePolicy, or typeCoercion.',
    },
  )
export type ColumnCleaningPlan = z.infer<typeof columnCleaningPlanSchema>

/** The full plan: one entry per column that needs cleaning, plus an optional overall summary. */
export const cleaningPlanSchema = z.object({
  columns: z
    .array(columnCleaningPlanSchema)
    .max(500, 'Too many column cleaning plans returned.'),
  /** Optional plain-language summary of the overall cleaning approach, for display/logging. */
  summary: z.string().min(1).optional(),
})
export type CleaningPlan = z.infer<typeof cleaningPlanSchema>

/** Thrown by `parseCleaningPlan` when the raw payload fails schema validation. Carries zod's issue list, mirroring `schema.ts`'s `InsightValidationError`. */
export class CleaningPlanValidationError extends Error {
  readonly issues: z.core.$ZodIssue[]

  constructor(issues: z.core.$ZodIssue[]) {
    const summary = issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ')
    super(`Invalid CleaningPlan payload: ${summary}`)
    this.name = 'CleaningPlanValidationError'
    this.issues = issues
  }
}

/**
 * Validates a raw (already-JSON-parsed) LLM response against
 * `cleaningPlanSchema`, returning a typed, valid `CleaningPlan` or throwing
 * `CleaningPlanValidationError`.
 */
export function parseCleaningPlan(raw: unknown): CleaningPlan {
  const result = cleaningPlanSchema.safeParse(raw)
  if (!result.success) {
    throw new CleaningPlanValidationError([...result.error.issues])
  }
  return result.data
}

/**
 * Returns a human-readable description of the failure if it's worth a
 * corrective retry (malformed JSON or a schema-invalid payload), or `null`
 * for a provider-level failure a corrective message can't fix — the same
 * policy `client.ts`'s `describeRetryableFailure` applies for `InsightGroup`,
 * duplicated here (rather than shared) because it inspects a
 * schema-specific error type.
 */
function describeCleaningPlanRetryableFailure(error: unknown): string | null {
  if (error instanceof CleaningPlanValidationError) {
    return error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n')
  }
  if (error instanceof SyntaxError) {
    return 'The response was not valid JSON.'
  }
  return null
}

// ---------------------------------------------------------------------------
// Prompt building
// ---------------------------------------------------------------------------

const TASK_INSTRUCTIONS = [
  'Task: propose a data-cleaning plan for the raw dataset described below.',
  'You are given each column\'s inferred type, sample values, and a',
  'pre-clean data-quality scan (missing values, near-duplicate/inconsistent',
  'categorical values, mixed types) run against the RAW, uncleaned data.',
  'This scan is not the final analysis — it exists only to inform this plan.',
  '',
  'When a data dictionary is provided below, use it: it explains what each',
  'column actually means in business terms, which should directly inform',
  'your cleaning decisions — e.g. a column the dictionary describes as a',
  'free-text/optional field is a better candidate for "leave-null" than',
  '"drop-row"; a column the dictionary identifies as an identifier or code',
  'should rarely get a value-mapping or type coercion that would alter its',
  'individual values; a column described as a rate/percentage/currency',
  'amount should coerce to a numeric type unless the dictionary says',
  'otherwise. Do not contradict the dictionary\'s stated meaning of a column.',
  '',
  'For every column that genuinely needs cleaning, decide:',
  '  1. valueMappings — an explicit "from" -> "to" table unifying categorical',
  '     variants that clearly mean the same thing (casing, whitespace, near-',
  '     duplicate spellings — e.g. "web"/"WEB"/"Web" all -> "Web"). Only',
  '     include mappings you are confident about; do not merge values that',
  '     might be genuinely distinct categories.',
  '  2. missingValuePolicy — exactly one action for how to handle missing',
  '     values in that column: "drop-row" (remove rows missing it, when the',
  '     column is essential and can\'t be reasonably defaulted), "fill-default"',
  '     (replace missing values with a specific literal defaultValue, when a',
  '     sensible default exists), or "leave-null" (explicitly leave it null,',
  '     when dropping or defaulting would be wrong — e.g. a genuinely',
  '     optional field). Only set this if the column actually has missing',
  '     values worth addressing.',
  '  3. typeCoercion — a single targetType ("string", "integer", "float",',
  '     "number", "date", or "boolean") to coerce the column\'s values to,',
  '     when the inferred/raw type is wrong or inconsistent (e.g. a mixed-',
  '     type numeric column, or a date column stored as text). Omit if the',
  '     column\'s current type is already correct.',
  '',
  'Every valueMapping, missingValuePolicy, and typeCoercion you propose MUST',
  'include a "reason" string explaining, in plain language, why that change',
  'is correct — this reason is shown verbatim to the analyst as an audit',
  'trail, so it must be specific to that column and value, not generic',
  'boilerplate.',
  '',
  'Do NOT include a column in the plan at all if it needs no cleaning.',
  'Do NOT invent columns that are not listed below.',
].join('\n')

function buildCleaningPlanSystemPrompt(): string {
  return buildSystemPrompt(TASK_INSTRUCTIONS)
}

const MAX_SAMPLE_VALUES = 5

function buildCleaningPlanUserContent(
  columns: ColumnMetadata[],
  quality: DataQualityReport,
  totalRows: number,
  datasetName: string | undefined,
  dictionary?: InsightGroup,
): string {
  const contextBlock = formatDatasetContext('Dataset context', {
    datasetName: datasetName ?? 'unknown',
    totalRows,
    totalColumns: columns.length,
  })

  const columnsBlock = formatDatasetContext('Columns (raw, uncleaned)', {
    columns: columns.map((column) => ({
      name: column.name,
      dataType: column.dataType,
      sampleValues: column.sampleValues
        .slice(0, MAX_SAMPLE_VALUES)
        .map((value) => String(value)),
    })),
  })

  const qualityBlock = formatDatasetContext(
    'Pre-clean data-quality scan (raw data — informs this plan only, not the final analysis)',
    { findings: summarizeQualityHighlights(quality) },
  )

  const dictionaryBlock = dictionary
    ? formatDatasetContext('Data dictionary (what each column means, in business terms)', {
        entries: condenseInsightGroupForContext(dictionary),
      })
    : null

  const shapeInstruction = [
    'Return a single JSON object shaped like this CleaningPlan:',
    '{',
    '  "columns": [',
    '    {',
    '      "columnName": string (must exactly match a column name above),',
    '      "valueMappings": [',
    '        { "from": string, "to": string, "reason": string }',
    '      ],',
    '      "missingValuePolicy":',
    '        { "action": "drop-row", "reason": string } |',
    '        { "action": "fill-default", "defaultValue": string | number | boolean, "reason": string } |',
    '        { "action": "leave-null", "reason": string } |',
    '        null,',
    '      "typeCoercion":',
    '        { "targetType": "string" | "integer" | "float" | "number" | "date" | "boolean", "reason": string } |',
    '        null',
    '    }',
    '  ],',
    '  "summary": string (optional, 1-3 sentences on the overall cleaning approach)',
    '}',
    'Only include columns that need at least one of valueMappings/missingValuePolicy/typeCoercion.',
    'Omit valueMappings (empty array) and set missingValuePolicy/typeCoercion to null when not applicable to that column.',
  ].join('\n')

  return [
    contextBlock,
    '',
    columnsBlock,
    '',
    qualityBlock,
    ...(dictionaryBlock ? ['', dictionaryBlock] : []),
    '',
    shapeInstruction,
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export interface GenerateCleaningPlanParams {
  /** Phase 3's structural analysis (`analyzeStructure`), run against the RAW table. */
  structural: StructuralAnalysis
  /** A first-pass quality scan (`analyzeDataQuality`) run once against the RAW table, used only to inform this plan — not the final post-clean EDA (Milestone 10.3). */
  quality: DataQualityReport
  /**
   * The already-generated data dictionary for this dataset, when available —
   * gives the model each column's actual business meaning to inform its
   * cleaning decisions (see `TASK_INSTRUCTIONS`), instead of guessing purely
   * from column names and raw sample values. Optional so this function still
   * works standalone (mirrors `generateBusinessInsights`'s `dictionary`
   * option, same rationale).
   */
  dictionary?: InsightGroup
  datasetName?: string
  signal?: AbortSignal
}

/**
 * Generates a schema-validated `CleaningPlan` from the raw structural pass
 * plus a first-pass quality scan, via Mistral (matching the data
 * dictionary/business insights/explanation calls' provider). Uses the
 * generalized `runValidatedJsonRequest` (`client.ts`) so it gets the same
 * JSON-repair parsing and retry-once-on-invalid-response policy every other
 * structured LLM call in this app already relies on. Throws `LlmError` on
 * any provider/validation failure (including a still-invalid retry).
 */
export async function generateCleaningPlan(
  params: GenerateCleaningPlanParams,
): Promise<CleaningPlan> {
  const { structural, quality, dictionary, datasetName, signal } = params
  const { columns, stats } = structural

  if (columns.length === 0) {
    throw new Error(
      'Cannot generate a cleaning plan: the dataset has no columns to analyze.',
    )
  }

  const systemPrompt = buildCleaningPlanSystemPrompt()
  const userContent = buildCleaningPlanUserContent(
    columns,
    quality,
    stats.totalRows,
    datasetName,
    dictionary,
  )

  return runValidatedJsonRequest({
    systemPrompt,
    userContent,
    callProvider: callMistralRawText,
    signal,
    parse: parseCleaningPlan,
    describeRetryableFailure: describeCleaningPlanRetryableFailure,
  })
}
