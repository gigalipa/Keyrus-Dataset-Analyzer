import { useEffect, useState } from 'react'
import type { FilePreview } from '../types/preview'
import { buildFilePreview } from '../utils/parseDelimited'

export type DataPreviewStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface DataPreviewState {
  status: DataPreviewStatus
  preview: FilePreview | null
  errorMessage: string | null
}

const INITIAL_STATE: DataPreviewState = {
  status: 'idle',
  preview: null,
  errorMessage: null,
}

/**
 * Builds a Phase 1 preview (CSV/TSV table, or an honest placeholder for
 * other formats) for the given file. Re-runs whenever the file changes and
 * ignores stale results if the file changes again mid-read.
 */
export function useDataPreview(file: File | null): DataPreviewState {
  const [state, setState] = useState<DataPreviewState>(INITIAL_STATE)
  // Tracks the file this hook has last synced state for, so a change in
  // `file` can flip the status to "loading" immediately during render
  // (React's "adjusting state during rendering" pattern) instead of via a
  // synchronous setState call inside the effect below.
  const [trackedFile, setTrackedFile] = useState<File | null>(null)

  if (file !== trackedFile) {
    setTrackedFile(file)
    setState(
      file
        ? { status: 'loading', preview: null, errorMessage: null }
        : INITIAL_STATE,
    )
  }

  useEffect(() => {
    if (!file) return

    let cancelled = false

    buildFilePreview(file)
      .then((preview) => {
        if (!cancelled)
          setState({ status: 'ready', preview, errorMessage: null })
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            status: 'error',
            preview: null,
            errorMessage:
              error instanceof Error
                ? error.message
                : 'Could not read this file for preview.',
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [file])

  return state
}
