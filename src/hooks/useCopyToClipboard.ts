import { useEffect, useState } from 'react'

/** How long the "Copied!" confirmation stays visible after a successful copy. Matches the value `ClientQuestionsPanel` established first. */
const COPY_CONFIRMATION_MS = 2000

/**
 * Phase 5, Milestone 5.3 "copy-to-clipboard buttons" — extracts the
 * `navigator.clipboard.writeText` + brief "Copied!" confirmation pattern
 * `ClientQuestionsPanel` established for individual questions, so
 * `BusinessInsightsPanel` (insights/recommendations) and any future caller
 * can reuse it instead of re-implementing the same timeout/state dance.
 */
export function useCopyToClipboard() {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timeoutId = window.setTimeout(
      () => setCopied(false),
      COPY_CONFIRMATION_MS,
    )
    return () => window.clearTimeout(timeoutId)
  }, [copied])

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      // Clipboard access denied/unavailable — silently no-op, the caller
      // simply won't show the "Copied!" confirmation.
    }
  }

  return { copied, copy }
}
