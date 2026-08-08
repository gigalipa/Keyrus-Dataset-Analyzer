/**
 * Structured-output request orchestration — Phase 4, Milestone 4.1. This is
 * the one place that ties together a provider's raw text-completion call
 * (`groq.ts` / `gemini.ts`), JSON parsing, and `schema.ts` validation,
 * with the "retry once with a corrective follow-up message before failing"
 * behavior required by the roadmap's error-handling done-when condition.
 * Milestones 4.2-4.4 call `runStructuredInsightRequest` instead of talking
 * to a provider client directly, so the retry/validation policy lives in
 * one place rather than being reimplemented per milestone.
 */
import { jsonrepair } from 'jsonrepair'
import {
  buildCorrectiveRetryMessage,
  buildInsightPromptMessages,
  type PromptMessage,
} from './prompt'
import {
  InsightValidationError,
  parseInsightGroup,
  type InsightGroup,
  type InsightType,
} from './schema'
import { LlmError, toLlmError } from './errors'

/** A provider-specific raw call: sends `messages`, returns the assistant's raw text response. */
export type RawProviderCall = (
  messages: PromptMessage[],
  signal?: AbortSignal,
) => Promise<string>

export interface RunStructuredInsightRequestParams {
  type: InsightType
  systemPrompt: string
  userContent: string
  /** Provider call to use, e.g. `callGroqRaw`, or `callGeminiRaw` adapted to return just `text`. */
  callProvider: RawProviderCall
  /** For `dictionaryEntry` groups: the actual analyzed column count to validate against exactly. */
  expectedCount?: number
  signal?: AbortSignal
}

/**
 * Runs a full structured-output request: calls the provider, parses the
 * response as JSON, validates it against the `InsightGroup` schema for
 * `type`, and — if parsing or validation fails — retries exactly once with
 * a corrective follow-up message describing what was wrong. Throws
 * `LlmError` (never a raw exception) on any failure, including a
 * still-invalid retry.
 */
export async function runStructuredInsightRequest(
  params: RunStructuredInsightRequestParams,
): Promise<InsightGroup> {
  const {
    type,
    systemPrompt,
    userContent,
    callProvider,
    expectedCount,
    signal,
  } = params

  const messages = buildInsightPromptMessages(systemPrompt, userContent)

  try {
    return await attemptOnce(
      type,
      messages,
      callProvider,
      expectedCount,
      signal,
    )
  } catch (firstError) {
    const issues = describeRetryableFailure(firstError)
    if (!issues) throw toLlmError(firstError)

    const retryMessages: PromptMessage[] = [
      ...messages,
      { role: 'user', content: buildCorrectiveRetryMessage(issues) },
    ]

    try {
      return await attemptOnce(
        type,
        retryMessages,
        callProvider,
        expectedCount,
        signal,
      )
    } catch (secondError) {
      throw toLlmError(secondError)
    }
  }
}

async function attemptOnce(
  type: InsightType,
  messages: PromptMessage[],
  callProvider: RawProviderCall,
  expectedCount: number | undefined,
  signal: AbortSignal | undefined,
): Promise<InsightGroup> {
  const rawText = await callProvider(messages, signal)
  const rawJson = parseJsonResponse(rawText)
  return parseInsightGroup(type, rawJson, expectedCount)
}

/**
 * Parses `text` as JSON, defensively handling the ways LLM responses commonly
 * deviate from strict JSON despite prompt instructions not to:
 *
 *  1. Strip a markdown code fence, if the model wrapped its output in one.
 *  2. Regex/bracket-match the outermost `{...}`/`[...]` substring, in case
 *     the model added leading/trailing prose ("Here's the JSON:" or similar).
 *  3. Try a strict `JSON.parse` on that substring first — the common case.
 *  4. If strict parsing fails, fall back to `jsonrepair`, which fixes the
 *     usual near-miss mistakes (trailing commas, unquoted keys, single
 *     quotes, truncated/unbalanced brackets) and try parsing again.
 *
 * Throws the original strict-parse error if even the repaired text won't
 * parse. `describeRetryableFailure` below treats any `SyntaxError` here as
 * retryable, so `runStructuredInsightRequest` will still get one corrective
 * retry from the model before giving up.
 */
function parseJsonResponse(text: string): unknown {
  const trimmed = text.trim()
  const fenceMatch = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed)
  const fenceStripped = fenceMatch ? fenceMatch[1] : trimmed
  const candidate = extractOutermostJsonSubstring(fenceStripped)

  try {
    return JSON.parse(candidate)
  } catch (strictError) {
    try {
      return JSON.parse(jsonrepair(candidate))
    } catch {
      throw strictError
    }
  }
}

/**
 * Finds the first `{` or `[` in `text` and returns the substring up to its
 * matching closing bracket, tracking string literals/escapes so brackets
 * inside quoted strings don't throw off the depth count. Unlike a naive
 * `/\{[\s\S]*\}/` regex (which greedily spans to the *last* `}` in the text
 * and would incorrectly swallow an enclosing array's brackets for a payload
 * like `[{...}, {...}]`), this respects actual nesting.
 *
 * If the text has no brackets, or the brackets never balance (a truncated
 * response), returns from the first bracket to the end of the text and lets
 * `jsonrepair` attempt to close it — that's exactly the kind of near-miss it
 * fixes.
 */
function extractOutermostJsonSubstring(text: string): string {
  const start = text.search(/[{[]/)
  if (start === -1) return text

  const openChar = text[start]
  const closeChar = openChar === '{' ? '}' : ']'
  let depth = 0
  let inString = false
  let escapeNext = false

  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (escapeNext) {
      escapeNext = false
      continue
    }
    if (ch === '\\' && inString) {
      escapeNext = true
      continue
    }
    if (ch === '"') {
      inString = !inString
      continue
    }
    if (inString) continue
    if (ch === openChar) {
      depth++
    } else if (ch === closeChar) {
      depth--
      if (depth === 0) {
        return text.slice(start, i + 1)
      }
    }
  }

  return text.slice(start)
}

/**
 * Returns a human-readable description of the failure if it's the kind
 * worth retrying with a corrective message (malformed JSON or a
 * schema-invalid payload), or `null` if it's a provider-level failure
 * (network, rate limit, missing key) that a corrective message can't fix.
 */
function describeRetryableFailure(error: unknown): string | null {
  if (error instanceof InsightValidationError) {
    return error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n')
  }
  if (error instanceof SyntaxError) {
    return 'The response was not valid JSON.'
  }
  if (error instanceof LlmError && error.kind === 'invalid-response') {
    return null
  }
  return null
}
