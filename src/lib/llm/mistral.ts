/**
 * Mistral provider client — Phase 4, Milestone 4.1. Mistral's chat
 * completions API is OpenAI-compatible, so a direct `fetch` call is
 * simplest.
 *
 * Configured with both a primary and a fallback model id
 * (`VITE_MISTRAL_MODEL_ID` / `VITE_MISTRAL_FALLBACK_MODEL_ID`), matching
 * `gemini.ts`'s try-primary-then-fallback pattern, so a provider-side
 * capacity limit on the primary model degrades to a second model rather than
 * failing outright.
 *
 * Requests Mistral's JSON response-format mode (`response_format: { type:
 * 'json_object' }`) so the model reliably returns parseable JSON — still
 * validated against `schema.ts` by the caller, since JSON mode only
 * guarantees syntactic validity, not that it matches our shape.
 *
 * Per the roadmap (as amended), Mistral is used for data-analysis calls
 * (Milestones 4.2 data dictionary, 4.3 business insights).
 */
import {
  getMistralApiKey,
  getMistralFallbackModelId,
  getMistralModelId,
} from './env'
import { llmErrorFromHttpStatus, LlmError } from './errors'
import type { PromptMessage } from './prompt'
import type { RawProviderCall } from './client'

const MISTRAL_CHAT_COMPLETIONS_URL =
  'https://api.mistral.ai/v1/chat/completions'

/** Per the LLM Integration Checklist: "Set up API call with timeout handling (max 60 seconds)." */
const REQUEST_TIMEOUT_MS = 60_000

interface MistralChatCompletionResponse {
  choices?: { message?: { content?: string } }[]
}

/** Which model actually produced a `callMistralRaw` result — surfaced for diagnostics/telemetry, same convention as `gemini.ts`'s `GeminiCallResult`. */
export interface MistralCallResult {
  text: string
  modelUsed: string
}

async function callMistralModel(
  model: string,
  messages: PromptMessage[],
  signal?: AbortSignal,
): Promise<string> {
  const apiKey = getMistralApiKey()
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  // Let an external abort (e.g. component unmount, or the outer
  // primary-then-fallback retry giving up) also cancel the request.
  const onExternalAbort = () => controller.abort()
  signal?.addEventListener('abort', onExternalAbort)

  try {
    const response = await fetch(MISTRAL_CHAT_COMPLETIONS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const bodyText = await response.text().catch(() => undefined)
      throw llmErrorFromHttpStatus(
        response.status,
        response.statusText,
        bodyText,
      )
    }

    const data = (await response.json()) as MistralChatCompletionResponse
    const content = data.choices?.[0]?.message?.content
    if (!content) {
      throw new LlmError(
        'invalid-response',
        'The AI service returned an empty response. Please try again.',
        data,
      )
    }
    return content
  } finally {
    clearTimeout(timeoutId)
    signal?.removeEventListener('abort', onExternalAbort)
  }
}

/**
 * Calls Mistral with the given messages, trying the configured primary model
 * first and falling back to the configured fallback model if the primary
 * call throws (e.g. a rate limit — the exact failure mode this provider swap
 * responds to). Returns the raw text response (a JSON string the caller
 * parses and validates against `schema.ts`) plus which model answered.
 */
export async function callMistralRaw(
  messages: PromptMessage[],
  signal?: AbortSignal,
): Promise<MistralCallResult> {
  const primaryModel = getMistralModelId()
  try {
    const text = await callMistralModel(primaryModel, messages, signal)
    return { text, modelUsed: primaryModel }
  } catch (primaryError) {
    if (signal?.aborted) throw primaryError
    const fallbackModel = getMistralFallbackModelId()
    try {
      const text = await callMistralModel(fallbackModel, messages, signal)
      return { text, modelUsed: fallbackModel }
    } catch {
      // Surface the primary error — it's the model the roadmap treats as
      // canonical, and the fallback failing too usually means the same
      // underlying issue (bad key, network down, both models rate-limited).
      throw primaryError
    }
  }
}

/**
 * `RawProviderCall`-shaped adapter over `callMistralRaw`, for use with
 * `runStructuredInsightRequest` (`client.ts`), which only needs the text and
 * doesn't care which of the two models answered.
 */
export const callMistralRawText: RawProviderCall = async (messages, signal) => {
  const { text } = await callMistralRaw(messages, signal)
  return text
}
