/**
 * DeepSeek provider client — Phase 4, Milestone 4.1. DeepSeek's chat
 * completions API is OpenAI-compatible, so a direct `fetch` call is simpler
 * and lighter than pulling in the OpenAI SDK for one endpoint. Requests
 * DeepSeek's JSON response-format mode so the model reliably returns
 * parseable JSON (still validated against `schema.ts` by the caller — JSON
 * mode guarantees syntactically valid JSON, not that it matches our shape).
 *
 * **Unused/historical:** DeepSeek was the original data-analysis provider
 * per the roadmap, but has since been replaced by Groq (`groq.ts`) for
 * Milestones 4.2 (data dictionary) and 4.3 (business insights), per the
 * actual `.env` configuration. This file is kept available (and
 * `getDeepSeekApiKey()` in `env.ts` still works) but is no longer wired
 * into any active routing.
 *
 * Direct browser-origin calls were verified to work (DeepSeek's API sends
 * `Access-Control-Allow-Origin` echoing the request origin on both the
 * preflight and the actual response) — see this milestone's verification
 * notes. No backend proxy is needed.
 */
import { getDeepSeekApiKey } from './env'
import { llmErrorFromHttpStatus, LlmError } from './errors'
import type { PromptMessage } from './prompt'

const DEEPSEEK_CHAT_COMPLETIONS_URL =
  'https://api.deepseek.com/chat/completions'
const DEEPSEEK_MODEL = 'deepseek-chat'

/** Per the LLM Integration Checklist: "Set up API call with timeout handling (max 60 seconds)." */
const REQUEST_TIMEOUT_MS = 60_000

interface DeepSeekChatCompletionResponse {
  choices?: { message?: { content?: string } }[]
}

/**
 * Calls DeepSeek's chat completions endpoint with the given messages,
 * requesting JSON-object output, and returns the raw assistant message
 * content (a JSON string the caller parses and validates against
 * `schema.ts`). Throws `LlmError` on network failure, non-2xx HTTP status
 * (429 classified as `rate-limit`), or a response missing the expected
 * `choices[0].message.content` field.
 */
export async function callDeepSeekRaw(
  messages: PromptMessage[],
  signal?: AbortSignal,
): Promise<string> {
  const apiKey = getDeepSeekApiKey()
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  // Let an external abort (e.g. component unmount) also cancel the request.
  const onExternalAbort = () => controller.abort()
  signal?.addEventListener('abort', onExternalAbort)

  try {
    const response = await fetch(DEEPSEEK_CHAT_COMPLETIONS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
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

    const data = (await response.json()) as DeepSeekChatCompletionResponse
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
