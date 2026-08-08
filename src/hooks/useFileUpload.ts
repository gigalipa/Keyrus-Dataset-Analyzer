import { useCallback, useEffect, useRef, useState } from 'react'
import type { UploadState } from '../types/upload'
import { validateFileExtension } from '../utils/fileValidation'

const SIMULATED_PROCESSING_MS = 1200

const INITIAL_STATE: UploadState = {
  status: 'idle',
  file: null,
  errorMessage: null,
}

/**
 * Drives the upload state machine: idle -> processing -> success | error.
 *
 * Phase 1 only validates the file extension and simulates processing with a
 * short delay — real parsing is wired in during Phase 2 (Data Ingestion
 * Pipeline), at which point the simulated timeout below is replaced with an
 * actual parse call.
 */
export function useFileUpload() {
  const [state, setState] = useState<UploadState>(INITIAL_STATE)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  const selectFile = useCallback((file: File) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)

    const validationError = validateFileExtension(file)
    if (validationError) {
      setState({ status: 'error', file: null, errorMessage: validationError })
      return
    }

    setState({ status: 'processing', file, errorMessage: null })

    // Simulated processing delay. Phase 2 replaces this with the real
    // CSV/TSV/XLS/XLSX/SQL parsing pipeline.
    timeoutRef.current = setTimeout(() => {
      setState((prev) =>
        prev.file === file
          ? { status: 'success', file, errorMessage: null }
          : prev,
      )
    }, SIMULATED_PROCESSING_MS)
  }, [])

  const reset = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setState(INITIAL_STATE)
  }, [])

  return { state, selectFile, reset }
}
