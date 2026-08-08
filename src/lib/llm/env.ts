/**
 * LLM provider API key / model-id access — Phase 4, Milestone 4.1.
 *
 * This is a Vite app with no backend, so both providers are called directly
 * from the browser (see `docs/development-process.md`'s Open Questions:
 * "API key setup"). Vite only exposes environment variables prefixed with
 * `VITE_` to client code via `import.meta.env` — un-prefixed variables
 * (like a plain `GROQ_API_KEY`) are invisible to the browser bundle. So
 * the `.env` variable names actually used by this app are:
 *
 *  - `VITE_GROQ_API_KEY`, `VITE_GROQ_MODEL_ID`
 *  - `VITE_GOOGLE_API_KEY`, `VITE_GOOGLE_MODEL_ID`, `VITE_GOOGLE_FALLBACK_MODEL_ID`
 *  - `VITE_DEEPSEEK_API_KEY` — DeepSeek was the original data-analysis
 *    provider but has been replaced by Groq; the accessor below is kept
 *    available but is no longer wired into any active routing (see
 *    `deepseek.ts`'s header comment).
 *
 * Model IDs are read from the environment rather than hardcoded so swapping
 * models later (e.g. a newer Llama or Gemini release) doesn't require a code
 * change — only an `.env` edit.
 *
 * `.env.example` documents these names; keep it and this file in sync if
 * either changes.
 */

/** Thrown when a required API key is missing from `import.meta.env`. */
export class MissingApiKeyError extends Error {
  constructor(varName: string) {
    super(`Missing ${varName}. Copy .env.example to .env and set your API key.`)
    this.name = 'MissingApiKeyError'
  }
}

function readRequiredEnvVar(varName: string): string {
  const value = import.meta.env[varName] as string | undefined
  if (!value || value.trim() === '') {
    throw new MissingApiKeyError(varName)
  }
  return value
}

/** Reads the DeepSeek API key, throwing `MissingApiKeyError` if unset. Kept available but unused — see this file's header comment. */
export function getDeepSeekApiKey(): string {
  return readRequiredEnvVar('VITE_DEEPSEEK_API_KEY')
}

/** Reads the Groq API key, throwing `MissingApiKeyError` if unset. */
export function getGroqApiKey(): string {
  return readRequiredEnvVar('VITE_GROQ_API_KEY')
}

/** Reads the configured Groq model id (e.g. `llama-3.3-70b-versatile`), throwing `MissingApiKeyError` if unset. */
export function getGroqModelId(): string {
  return readRequiredEnvVar('VITE_GROQ_MODEL_ID')
}

/** Reads the Google AI Studio (Gemini) API key, throwing `MissingApiKeyError` if unset. */
export function getGoogleApiKey(): string {
  return readRequiredEnvVar('VITE_GOOGLE_API_KEY')
}

/** Reads the configured primary Google AI Studio (Gemini) model id, throwing `MissingApiKeyError` if unset. */
export function getGoogleModelId(): string {
  return readRequiredEnvVar('VITE_GOOGLE_MODEL_ID')
}

/** Reads the configured fallback Google AI Studio (Gemini) model id, throwing `MissingApiKeyError` if unset. */
export function getGoogleFallbackModelId(): string {
  return readRequiredEnvVar('VITE_GOOGLE_FALLBACK_MODEL_ID')
}
