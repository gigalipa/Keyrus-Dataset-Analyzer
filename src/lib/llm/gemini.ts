/**
 * Google AI Studio (Gemini) provider client — Phase 4, Milestone 4.1. Uses
 * `@google/genai`, Google's current unified GenAI SDK (verified via `npm
 * view` to be the actively maintained package — the older
 * `@google/generative-ai` is the predecessor). Requests JSON output via
 * `responseMimeType: 'application/json'`; the raw response is still parsed
 * and validated against `schema.ts` by the caller, JSON mode only
 * guarantees syntactic validity.
 *
 * The primary and fallback model ids are read from `VITE_GOOGLE_MODEL_ID`
 * and `VITE_GOOGLE_FALLBACK_MODEL_ID` (via `env.ts`) rather than hardcoded,
 * so swapping models later doesn't require a code change. `callGeminiRaw`
 * tries the primary model first and falls back to the secondary model if
 * the primary call fails with a provider-level error
 * (network/rate-limit/invalid-response) — this is a different retry axis
 * than the schema-invalid retry-once handled by
 * `runStructuredInsightRequest` (`client.ts`), which applies regardless of
 * which model ultimately answered.
 *
 * Per the roadmap, Google AI Studio is used for report-text/narrative
 * generation (Milestone 4.4, client questions).
 *
 * Direct browser-origin calls were verified to work (the Generative
 * Language API sends `Access-Control-Allow-Origin` echoing the request
 * origin on both the preflight and the actual response) — see this
 * milestone's verification notes. No backend proxy is needed.
 */
import { GoogleGenAI } from '@google/genai'
import {
  getGoogleApiKey,
  getGoogleFallbackModelId,
  getGoogleModelId,
} from './env'
import { LlmError } from './errors'
import type { PromptMessage } from './prompt'
import type { RawProviderCall } from './client'

/** Which model actually produced a `callGeminiRaw` result — surfaced for diagnostics/telemetry. */
export interface GeminiCallResult {
  text: string
  modelUsed: string
}

async function callGeminiModel(
  model: string,
  messages: PromptMessage[],
  signal?: AbortSignal,
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: getGoogleApiKey() })
  const systemMessage = messages.find((m) => m.role === 'system')?.content
  const userContents = messages
    .filter((m) => m.role === 'user')
    .map((m) => ({ role: 'user' as const, parts: [{ text: m.content }] }))

  try {
    const response = await ai.models.generateContent({
      model,
      contents: userContents,
      config: {
        systemInstruction: systemMessage,
        responseMimeType: 'application/json',
        abortSignal: signal,
      },
    })

    const text = response.text
    if (!text) {
      throw new LlmError(
        'invalid-response',
        'The AI service returned an empty response. Please try again.',
        response,
      )
    }
    return text
  } catch (error) {
    if (error instanceof LlmError) throw error
    throw classifyGeminiError(error)
  }
}

/** `@google/genai` throws plain `Error`s carrying an HTTP-status-shaped message on API failures; classify 429s as rate limits. */
function classifyGeminiError(error: unknown): LlmError {
  if (error instanceof Error) {
    if (/429|rate.?limit|resource.?exhausted/i.test(error.message)) {
      return new LlmError(
        'rate-limit',
        'The AI service is receiving too many requests right now. Please wait a moment and try again.',
        error,
      )
    }
    return new LlmError(
      'invalid-response',
      "Couldn't get a response from the AI service. Please try again.",
      error,
    )
  }
  return new LlmError(
    'unknown',
    'Something went wrong. Please try again.',
    error,
  )
}

/**
 * Calls Gemini with the given messages, trying the configured primary model
 * (`VITE_GOOGLE_MODEL_ID`) first and falling back to the configured fallback
 * model (`VITE_GOOGLE_FALLBACK_MODEL_ID`) if the primary call throws.
 * Returns the raw text response (a JSON string the caller parses and
 * validates against `schema.ts`) plus which model answered.
 */
export async function callGeminiRaw(
  messages: PromptMessage[],
  signal?: AbortSignal,
): Promise<GeminiCallResult> {
  const primaryModel = getGoogleModelId()
  const fallbackModel = getGoogleFallbackModelId()
  try {
    const text = await callGeminiModel(primaryModel, messages, signal)
    return { text, modelUsed: primaryModel }
  } catch (primaryError) {
    if (signal?.aborted) throw primaryError
    try {
      const text = await callGeminiModel(fallbackModel, messages, signal)
      return { text, modelUsed: fallbackModel }
    } catch {
      // Surface the primary error — it's the model the roadmap treats as
      // canonical, and the fallback failing too usually means the same
      // underlying issue (bad key, network down, etc.).
      throw primaryError
    }
  }
}

/**
 * `RawProviderCall`-shaped adapter over `callGeminiRaw`, for use with
 * `runStructuredInsightRequest` (`client.ts`), which only needs the text and
 * doesn't care which of the two models answered.
 */
export const callGeminiRawText: RawProviderCall = async (messages, signal) => {
  const { text } = await callGeminiRaw(messages, signal)
  return text
}
