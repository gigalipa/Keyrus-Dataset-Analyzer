import { useCallback, useRef, useState } from 'react'
import { toLlmError, type LlmError } from '../lib/llm/errors'

/** Lifecycle states for an LLM request, matching the `useFileUpload`/`useDataPreview` hook pattern. */
export type LlmRequestStatus = 'idle' | 'loading' | 'success' | 'error'

export interface LlmRequestState<T> {
  status: LlmRequestStatus
  data: T | null
  error: LlmError | null
}

const INITIAL_STATE = <T>(): LlmRequestState<T> => ({
  status: 'idle',
  data: null,
  error: null,
})

/**
 * Reusable loading-state hook for LLM-powered operations (Milestones
 * 4.2-4.4's data dictionary, business insights, and client questions calls),
 * consistent with the `idle -> processing/loading -> success -> error`
 * pattern already used by `useFileUpload` and `useDataPreview`
 * (`src/hooks/`). Consumers pass an async function (typically wrapping
 * `runStructuredInsightRequest`) to `run`; the hook tracks status/data/error
 * and guards against a stale response overwriting state after a newer
 * request started (mirrors `useDataPreview`'s cancellation pattern) or after
 * unmount.
 */
export function useLlmRequest<T>() {
  const [state, setState] = useState<LlmRequestState<T>>(INITIAL_STATE<T>())
  const requestIdRef = useRef(0)
  const abortControllerRef = useRef<AbortController | null>(null)

  const run = useCallback(async (task: (signal: AbortSignal) => Promise<T>) => {
    const requestId = ++requestIdRef.current
    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller

    setState({ status: 'loading', data: null, error: null })

    try {
      const data = await task(controller.signal)
      if (requestIdRef.current === requestId) {
        setState({ status: 'success', data, error: null })
      }
      return data
    } catch (error) {
      if (requestIdRef.current === requestId) {
        setState({ status: 'error', data: null, error: toLlmError(error) })
      }
      return null
    }
  }, [])

  const reset = useCallback(() => {
    abortControllerRef.current?.abort()
    requestIdRef.current++
    setState(INITIAL_STATE<T>())
  }, [])

  /**
   * Sets `status`/`data` straight to `'success'` without calling `run` —
   * for hydrating from an already-generated result (e.g. a value persisted
   * to IndexedDB in a previous session/dataset-switch) instead of re-running
   * the underlying LLM call. Cancels any in-flight request the same way
   * `reset` does, since seeding supersedes whatever was in progress.
   */
  const seed = useCallback((data: T) => {
    abortControllerRef.current?.abort()
    requestIdRef.current++
    setState({ status: 'success', data, error: null })
  }, [])

  return { ...state, run, reset, seed }
}
