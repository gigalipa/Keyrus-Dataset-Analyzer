/**
 * LLM error handling — Phase 4, Milestone 4.1. A single error type,
 * `LlmError`, wraps every failure mode an LLM call in this app can hit
 * (network failure, HTTP 429 rate limiting, an invalid/malformed HTTP
 * response, or a schema-invalid JSON payload per `schema.ts`) behind one
 * shape with a `kind` discriminant and a `userMessage` that's always safe
 * to render directly in the UI — callers never need to `instanceof`-sniff
 * raw `TypeError`/`SyntaxError`/`InsightValidationError` themselves.
 */
import { InsightValidationError } from './schema'

/** The failure modes an LLM call can surface, per the Milestone 4.1 done-when condition. */
export type LlmErrorKind =
  | 'network'
  | 'rate-limit'
  | 'invalid-response'
  | 'schema-invalid'
  | 'missing-api-key'
  | 'unknown'

/** User-friendly, UI-safe error for any LLM provider call failure. */
export class LlmError extends Error {
  readonly kind: LlmErrorKind
  /** Always safe to show directly to the consultant using the app — no raw exception text. */
  readonly userMessage: string
  readonly cause?: unknown

  constructor(kind: LlmErrorKind, userMessage: string, cause?: unknown) {
    super(userMessage)
    this.name = 'LlmError'
    this.kind = kind
    this.userMessage = userMessage
    this.cause = cause
  }
}

const NETWORK_MESSAGE =
  "Couldn't reach the AI service. Check your connection and try again."
const RATE_LIMIT_MESSAGE =
  'The AI service is receiving too many requests right now. Please wait a moment and try again.'
const TIMEOUT_MESSAGE =
  'The AI service took too long to respond. Please try again.'
const INVALID_RESPONSE_MESSAGE =
  "The AI service returned a response we couldn't understand. Please try again."
const SCHEMA_INVALID_MESSAGE =
  "The AI service's response didn't match the expected format, even after a retry. Please try again."

/**
 * Normalizes any error thrown while calling or parsing an LLM provider
 * response into an `LlmError`. Provider-specific `callXxx` functions call
 * this in their `catch` blocks so every caller (the `useLlmRequest` hook,
 * Milestones 4.2-4.4's display components) only ever deals with one error
 * shape.
 */
export function toLlmError(error: unknown): LlmError {
  if (error instanceof LlmError) return error

  if (error instanceof InsightValidationError) {
    return new LlmError('schema-invalid', SCHEMA_INVALID_MESSAGE, error)
  }

  if (error instanceof DOMException && error.name === 'AbortError') {
    return new LlmError('network', TIMEOUT_MESSAGE, error)
  }

  // Browser `fetch` rejects with a generic TypeError on network failure
  // (offline, DNS failure, CORS rejection, etc.) — there's no structured
  // way to distinguish the cause, so it's treated as a network error.
  if (error instanceof TypeError) {
    return new LlmError('network', NETWORK_MESSAGE, error)
  }

  if (error instanceof SyntaxError) {
    return new LlmError('invalid-response', INVALID_RESPONSE_MESSAGE, error)
  }

  if (error instanceof Error) {
    return new LlmError('unknown', error.message, error)
  }

  return new LlmError(
    'unknown',
    'Something went wrong. Please try again.',
    error,
  )
}

/** Builds an `LlmError` for a non-OK HTTP response, classifying 429 as `rate-limit` and other failures as `invalid-response`. */
export function llmErrorFromHttpStatus(
  status: number,
  statusText: string,
  bodyText?: string,
): LlmError {
  if (status === 429) {
    return new LlmError('rate-limit', RATE_LIMIT_MESSAGE, {
      status,
      statusText,
      bodyText,
    })
  }
  return new LlmError(
    'invalid-response',
    `${INVALID_RESPONSE_MESSAGE} (HTTP ${status})`,
    { status, statusText, bodyText },
  )
}
