/**
 * LLM provider API key / model-id access — Phase 4, Milestone 4.1.
 *
 * This is a Vite app with no backend, so both providers are called directly
 * from the browser (see `docs/development-process.md`'s Open Questions:
 * "API key setup"). Vite only exposes environment variables prefixed with
 * `VITE_` to client code via `import.meta.env` — un-prefixed variables are
 * invisible to the browser bundle. So the `.env` variable names actually
 * used by this app are:
 *
 *  - `VITE_MISTRAL_API_KEY`, `VITE_MISTRAL_MODEL_ID`, `VITE_MISTRAL_FALLBACK_MODEL_ID`
 *  - `VITE_GOOGLE_API_KEY`, `VITE_GOOGLE_MODEL_ID`, `VITE_GOOGLE_FALLBACK_MODEL_ID`
 *
 * Model IDs are read from the environment rather than hardcoded so swapping
 * models later doesn't require a code change — only an `.env` edit.
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

/** Reads the Mistral API key, throwing `MissingApiKeyError` if unset. */
export function getMistralApiKey(): string {
  return readRequiredEnvVar('VITE_MISTRAL_API_KEY')
}

/** Reads the configured primary Mistral model id (e.g. `mistral-large-2512`), throwing `MissingApiKeyError` if unset. */
export function getMistralModelId(): string {
  return readRequiredEnvVar('VITE_MISTRAL_MODEL_ID')
}

/** Reads the configured fallback Mistral model id, throwing `MissingApiKeyError` if unset. */
export function getMistralFallbackModelId(): string {
  return readRequiredEnvVar('VITE_MISTRAL_FALLBACK_MODEL_ID')
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
