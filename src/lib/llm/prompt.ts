/**
 * Prompt engineering utilities — Phase 4, Milestone 4.1. Shared helpers for
 * building the system prompt, injecting dataset context, and formatting the
 * JSON-shape instruction (including the `InsightGroup` quantity bounds from
 * `schema.ts`) that Milestones 4.2-4.4 use for every structured-output call.
 * These are content-agnostic — the actual "explain this column" / "find
 * KPIs" / "ask strategic questions" instructions belong to each milestone's
 * own prompt template, which composes these helpers rather than
 * reimplementing prompt scaffolding.
 */
import { INSIGHT_TYPE_BOUNDS, type InsightGroup, type InsightType } from './schema'

/** A minimal, provider-agnostic chat message. */
export interface PromptMessage {
  role: 'system' | 'user'
  content: string
}

/**
 * Builds the shared system prompt: the consultant-facing persona/framing
 * common to every structured-output call in this app, plus the caller's
 * task-specific instructions appended after it.
 */
export function buildSystemPrompt(taskInstructions: string): string {
  return [
    'You are a senior data analyst consultant helping a human consultant',
    'understand a client dataset. You analyze structured summaries and',
    'respond with concise, business-relevant, non-technical language a',
    "client's stakeholders could understand.",
    '',
    'Before proposing any metric, first work out what kind of business or',
    'activity this dataset actually represents from its column names and',
    'statistics (e.g. e-commerce orders, tourism/visitor records, support',
    'tickets, healthcare visits) — do not default to retail/revenue framing',
    'just because that is a common dataset shape. Every metric you propose',
    'must be one this specific dataset genuinely supports and that a',
    'stakeholder in that domain would actually track, not a generic metric',
    'copied from a different kind of business.',
    '',
    'Also apply basic statistical judgment: summing (or averaging) a column',
    'is only meaningful when the total (or average) itself means something',
    'real. Per-entity attributes like age, a rating/score, a percentage,',
    'rate, ratio, or index value, or an identifier/code column do not',
    'become a meaningful business figure just because they are numeric —',
    '"total age", "total customer ID" or "Total unit price", for example,',
    ' are meaningless and must never be proposed.',
    'When such a column matters, describe it the way it is actually useful',
    '(e.g. an average, a range, or a distribution/breakdown by segment),',
    'or leave it out entirely.',
    '',
    taskInstructions,
    '',
    'Always respond with a single JSON object and nothing else — no',
    'markdown code fences, no prose before or after the JSON.',
  ].join('\n')
}

/**
 * Renders arbitrary dataset-context data (column metadata, quality-check
 * summaries, statistical highlights — whatever the caller's analysis
 * summary looks like) as a labeled JSON block ready to inject into a user
 * message. Kept generic so Milestone 4.3's "prepare analysis summary" task
 * can shape its own summary object without this helper needing to know its
 * fields.
 */
export function formatDatasetContext(
  label: string,
  context: Record<string, unknown>,
): string {
  return `${label}:\n${JSON.stringify(context, null, 2)}`
}

/**
 * Formats the JSON-output-shape instruction for a given `InsightType`,
 * including the quantity bounds declared once in
 * `schema.ts`'s `INSIGHT_TYPE_BOUNDS` — never hardcoded per prompt
 * template. Tells the model the exact field names it must return.
 *
 * @param expectedCount For `dictionaryEntry`: the actual analyzed column
 *   count, so the instruction states an exact required count instead of
 *   the type's nominal (unbounded) range.
 */
export function formatInsightGroupInstruction(
  type: InsightType,
  expectedCount?: number,
): string {
  const bounds = INSIGHT_TYPE_BOUNDS[type]
  const quantityText =
    type === 'dictionaryEntry' && expectedCount !== undefined
      ? `exactly ${expectedCount} item(s) — one per analyzed column`
      : bounds.max !== undefined
        ? `between ${bounds.min} and ${bounds.max} items`
        : `at least ${bounds.min} items`

  return [
    `Return a single JSON object shaped like this InsightGroup:`,
    '{',
    `  "type": "${type}",`,
    `  "label": "${bounds.label}",`,
    `  "minItems": ${bounds.min},`,
    bounds.max !== undefined ? `  "maxItems": ${bounds.max},` : undefined,
    '  "items": [',
    '    {',
    '      "id": string (unique, e.g. a short kebab-case slug),',
    `      "type": "${type}",`,
    '      "title": string (short headline),',
    '      "description": string (1-3 sentences, business language),',
    '      "tags": string[] (facets for filtering, e.g. domain or severity),',
    '      "priority": "high" | "medium" | "low" (optional),',
    '      "metadata": object (optional, type-specific extra fields)',
    '    }',
    '  ]',
    '}',
    `The "items" array must contain ${quantityText}. Every item's "type" must be "${type}".`,
  ]
    .filter((line): line is string => line !== undefined)
    .join('\n')
}

/**
 * Builds a corrective follow-up user message for the one-retry-on-invalid-
 * JSON flow (Part 3 error handling): tells the model exactly what was wrong
 * with its previous response so the retry has a real chance of succeeding,
 * instead of blindly repeating the same request.
 */
export function buildCorrectiveRetryMessage(issues: string): string {
  return [
    'Your previous response did not match the required JSON shape.',
    'Problems found:',
    issues,
    '',
    'Respond again with a single corrected JSON object satisfying every',
    'requirement above. Do not include any explanation, markdown, or text',
    'outside the JSON object.',
  ].join('\n')
}

/**
 * Condenses an already-generated `InsightGroup` down to just what's useful
 * as *context* for a later, chained prompt (Phase 8, Milestone 8.1's
 * "feed prior-step output into each subsequent LLM prompt") — title,
 * description, tags, and priority if set. Drops `id` and `metadata` (e.g.
 * a dictionary entry's raw `sampleValues`, a KPI's numeric `value`/`unit`)
 * since those are either irrelevant to a downstream prompt or would bloat
 * it without adding useful signal; the description text already carries the
 * substance a later step needs to build on.
 */
export function condenseInsightGroupForContext(
  group: InsightGroup,
): Array<{ title: string; description: string; tags: string[]; priority?: string }> {
  return group.items.map((item) => ({
    title: item.title,
    description: item.description,
    tags: item.tags,
    ...(item.priority ? { priority: item.priority } : {}),
  }))
}

/** Assembles the final message list (system + user) for a structured-output call. */
export function buildInsightPromptMessages(
  systemPrompt: string,
  userContent: string,
): PromptMessage[] {
  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent },
  ]
}
