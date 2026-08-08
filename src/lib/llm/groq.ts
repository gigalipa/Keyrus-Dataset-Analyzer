/**
 * Groq provider client — Phase 4, Milestone 4.1 (provider swap). Groq's chat
 * completions API is OpenAI-compatible, so a direct `fetch` call is simpler
 * and lighter than pulling in an SDK for one endpoint. This mirrors
 * `deepseek.ts`'s structure closely — DeepSeek was the original
 * data-analysis provider and has been replaced by Groq (running Llama 3.3
 * 70B Versatile) per the actual `.env` configuration; `deepseek.ts` is kept
 * in the codebase but is no longer wired into any active routing.
 *
 * Requests Groq's JSON response-format mode (`response_format: { type:
 * 'json_object' }`) so the model reliably returns parseable JSON — still
 * validated against `schema.ts` by the caller, since JSON mode only
 * guarantees syntactic validity, not that it matches our shape. Groq's JSON
 * mode support is model-dependent; the model actually in use
 * (`llama-3.3-70b-versatile`, via `VITE_GROQ_MODEL_ID`) supports it, but
 * even if a future model swap didn't, `runStructuredInsightRequest`
 * (`client.ts`) already retries once on invalid JSON as a safety net.
 *
 * The model id is read from `VITE_GROQ_MODEL_ID` via `env.ts` rather than
 * hardcoded, so swapping models later doesn't require a code change.
 *
 * Per the roadmap (as amended), Groq is used for data-analysis calls
 * (Milestones 4.2 data dictionary, 4.3 business insights).
 */
import { getGroqApiKey, getGroqModelId } from './env'
import { llmErrorFromHttpStatus, LlmError } from './errors'
import type { PromptMessage } from './prompt'
import type { RawProviderCall } from './client'

const GROQ_CHAT_COMPLETIONS_URL =
  'https://api.groq.com/openai/v1/chat/completions'

/** Per the LLM Integration Checklist: "Set up API call with timeout handling (max 60 seconds)." */
const REQUEST_TIMEOUT_MS = 60_000

interface GroqChatCompletionResponse {
  choices?: { message?: { content?: string } }[]
}

/**
 * Calls Groq's chat completions endpoint with the given messages, requesting
 * JSON-object output, and returns the raw assistant message content (a JSON
 * string the caller parses and validates against `schema.ts`). Throws
 * `LlmError` on network failure, non-2xx HTTP status (429 classified as
 * `rate-limit`), or a response missing the expected
 * `choices[0].message.content` field.
 */
export async function callGroqRaw(
  messages: PromptMessage[],
  signal?: AbortSignal,
): Promise<string> {
  const apiKey = getGroqApiKey()
  const model = getGroqModelId()
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  // Let an external abort (e.g. component unmount) also cancel the request.
  const onExternalAbort = () => controller.abort()
  signal?.addEventListener('abort', onExternalAbort)

  try {
    const response = await fetch(GROQ_CHAT_COMPLETIONS_URL, {
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

    const data = (await response.json()) as GroqChatCompletionResponse
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

/** `RawProviderCall`-shaped alias over `callGroqRaw`, for direct use as `callProvider` with `runStructuredInsightRequest` (`client.ts`). */
export const callGroqRawText: RawProviderCall = callGroqRaw
