/**
 * Shared structured-insight schema — Phase 4, Milestone 4.1. This is the one
 * contract Milestones 4.2 (data dictionary), 4.3 (business insights), and
 * 4.4 (client questions) all render through, so the UI can display and
 * filter any LLM-generated content generically instead of each milestone
 * inventing its own incompatible shape (the drift that happened with Phase
 * 2's three parsers, called out explicitly in the roadmap).
 *
 * ## Contract
 *
 * - `InsightItem` is the atomic unit: one KPI, one insight, one
 *   recommendation, one client question, or one data-dictionary entry.
 *   `tags` is what the UI filters on (business domain, severity, data-type,
 *   data-quality concern, topic — the meaning of a tag is content-specific,
 *   the mechanism is not). `metadata` carries type-specific extras (e.g. a
 *   KPI's `{ value, unit }`, a dictionary entry's `{ columnName, dataType }`)
 *   without polluting the shared shape.
 * - `InsightGroup` wraps a list of same-typed items with the label to render
 *   and the quantity bounds that were requested of the LLM, so a display
 *   component can show "3 of 3-5 expected" style context without hardcoding
 *   the bounds itself.
 * - Per-type quantity bounds live in one place — `INSIGHT_TYPE_BOUNDS` below
 *   — rather than being hardcoded in each of Milestones 4.2-4.4's
 *   components or prompt templates. `dictionaryEntry` has no fixed range
 *   (bounded by the dataset's actual column count instead), so its `min`
 *   there is a nominal `0` and callers must pass the real column count to
 *   `parseInsightGroup`/`buildInsightGroupSchema` to validate against.
 * - `parseInsightGroup(type, raw, options?)` is the single validation
 *   entry point Milestones 4.2-4.4's error handling calls after an LLM
 *   response is parsed as JSON: it returns a typed, valid `InsightGroup` or
 *   throws `InsightValidationError` with a human-readable `issues` list
 *   (zod's own issue list, not a raw exception) so callers can build a
 *   corrective retry message (Part 3) from it.
 */
import { z } from 'zod'

/** The five kinds of structured content the LLM providers generate for this app. */
export type InsightType =
  'kpi' | 'insight' | 'recommendation' | 'question' | 'dictionaryEntry'

/** Priority/severity hint an item can carry for display and filtering. */
export type InsightPriority = 'high' | 'medium' | 'low'

/** One atomic piece of LLM-generated content, generic across all five `InsightType`s. */
export interface InsightItem {
  /** Stable identifier, unique within its `InsightGroup`. */
  id: string
  type: InsightType
  title: string
  description: string
  /** Filter facets — business domain, severity, data-quality concern, topic, etc. Content-specific meaning, generic mechanism. */
  tags: string[]
  priority?: InsightPriority
  /** Type-specific extras, e.g. a KPI's `{ value, unit }` or a dictionary entry's `{ columnName, dataType }`. */
  metadata?: Record<string, unknown>
}

/** A same-typed collection of `InsightItem`s, with the quantity bounds the LLM was asked to satisfy. */
export interface InsightGroup {
  type: InsightType
  /** Human-readable section label, e.g. "Key Performance Indicators". */
  label: string
  minItems: number
  /** Absent for `dictionaryEntry`, whose real bound is the dataset's column count, not a fixed number. */
  maxItems?: number
  items: InsightItem[]
}

/**
 * Per-type quantity bounds, declared once and reused by prompt templates
 * (Part 3), zod validation below, and Milestones 4.2-4.4's display
 * components — never hardcoded per component.
 *
 * - KPIs: 2-5.
 * - Insights: 3-5.
 * - Recommendations: 3+ (no hard business cap; `zodMax` is a soft ceiling
 *   so a malformed LLM response can't smuggle in hundreds of items).
 * - Questions: 2+ (same soft-cap treatment as recommendations).
 * - Dictionary entries: one per analyzed column — dataset-dependent, so
 *   there's no fixed range here. `min`/`zodMax` are nominal; real callers
 *   pass `expectedCount` (the actual column count) to
 *   `buildInsightGroupSchema`/`parseInsightGroup`, which then requires
 *   exactly that many items.
 */
export interface InsightTypeBounds {
  label: string
  min: number
  max?: number
  /** Soft cap used only for zod's `.max()` refinement, to bound worst-case malformed responses. Not a business rule. */
  zodMax: number
}

export const INSIGHT_TYPE_BOUNDS: Record<InsightType, InsightTypeBounds> = {
  kpi: { label: 'Key Performance Indicators', min: 2, max: 5, zodMax: 5 },
  insight: { label: 'Insights', min: 3, max: 5, zodMax: 5 },
  recommendation: { label: 'Recommendations', min: 3, zodMax: 8 },
  question: { label: 'Client Questions', min: 2, zodMax: 10 },
  dictionaryEntry: { label: 'Data Dictionary', min: 0, zodMax: 500 },
}

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const insightTypeSchema = z.enum([
  'kpi',
  'insight',
  'recommendation',
  'question',
  'dictionaryEntry',
])

const insightPrioritySchema = z.enum(['high', 'medium', 'low'])

export const insightItemSchema = z.object({
  id: z.string().min(1, 'id must not be empty'),
  type: insightTypeSchema,
  title: z.string().min(1, 'title must not be empty'),
  description: z.string().min(1, 'description must not be empty'),
  tags: z.array(z.string()),
  priority: insightPrioritySchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}) satisfies z.ZodType<InsightItem>

/**
 * Builds a zod schema for an `InsightGroup` of a specific `type`, enforcing:
 *  - every item's `type` field matches the group's `type`,
 *  - the item count falls within the type's configured bounds (or exactly
 *    `expectedCount` for `dictionaryEntry`, since its bound is
 *    dataset-dependent rather than fixed).
 *
 * @param expectedCount For `dictionaryEntry` only: the actual analyzed
 *   column count, used as an exact min/max instead of the nominal
 *   `INSIGHT_TYPE_BOUNDS.dictionaryEntry` range.
 */
export function buildInsightGroupSchema(
  type: InsightType,
  expectedCount?: number,
) {
  const bounds = INSIGHT_TYPE_BOUNDS[type]
  const min =
    type === 'dictionaryEntry' && expectedCount !== undefined
      ? expectedCount
      : bounds.min
  const max =
    type === 'dictionaryEntry' && expectedCount !== undefined
      ? expectedCount
      : (bounds.max ?? bounds.zodMax)

  return z.object({
    type: z.literal(type),
    label: z.string().min(1),
    minItems: z.number().int().nonnegative(),
    maxItems: z.number().int().positive().optional(),
    items: z
      .array(insightItemSchema)
      .min(min, `Expected at least ${min} "${type}" item(s), got fewer.`)
      .max(max, `Expected at most ${max} "${type}" item(s), got more.`)
      .refine(
        (items) => items.every((item) => item.type === type),
        `Every item's "type" must equal the group's type ("${type}").`,
      ),
  })
}

/** Thrown by `parseInsightGroup` when the raw payload fails schema validation. Carries zod's issue list for building a corrective retry message. */
export class InsightValidationError extends Error {
  readonly issues: z.core.$ZodIssue[]

  constructor(type: InsightType, issues: z.core.$ZodIssue[]) {
    const summary = issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ')
    super(`Invalid "${type}" InsightGroup payload: ${summary}`)
    this.name = 'InsightValidationError'
    this.issues = issues
  }
}

/**
 * Validates a raw (already-JSON-parsed) LLM response against the
 * `InsightGroup` schema for `type`, returning a typed, valid `InsightGroup`
 * or throwing `InsightValidationError`. This is what Milestones 4.2-4.4's
 * error handling calls after parsing an LLM response body as JSON, and what
 * Part 3's retry-once-on-invalid-JSON logic uses to decide whether a retry
 * is needed.
 *
 * @param expectedCount For `dictionaryEntry` groups: the actual analyzed
 *   column count to validate the item count against exactly.
 */
export function parseInsightGroup(
  type: InsightType,
  raw: unknown,
  expectedCount?: number,
): InsightGroup {
  const schema = buildInsightGroupSchema(type, expectedCount)
  const result = schema.safeParse(raw)
  if (!result.success) {
    throw new InsightValidationError(type, [...result.error.issues])
  }
  return result.data
}
