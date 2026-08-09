import { useCallback, useRef, useState } from 'react'
import type { AnalysisResult, UploadState } from '../types/upload'
import { validateFileExtension } from '../utils/fileValidation'
import { parseFileToArqueroTable, FileParseError } from '../lib/parsers'
import { analyzeStructure } from '../lib/analysis/structural'
import { analyzeNumericColumns } from '../lib/analysis/numeric'
import { analyzeDataQuality } from '../lib/analysis/quality'
import { analyzeDateColumns } from '../lib/analysis/dates'

const INITIAL_STATE: UploadState = {
  status: 'idle',
  file: null,
  errorMessage: null,
  analysis: null,
}

/**
 * Drives the upload state machine: idle -> processing -> success | error.
 *
 * This is the real end-to-end pipeline (Phase 5, Milestone 5.1): on
 * `selectFile`, it parses the file into an Arquero table
 * (`parseFileToArqueroTable`, Phase 2) and then runs Phase 3's four analysis
 * passes against it — structural first, since numeric/quality/date analysis
 * all depend on the `ColumnMetadata[]` structural analysis produces, the
 * same dependency order Phase 3 documents its own modules with. The table
 * and every analysis result are lifted into this hook's state (rather than
 * a separate hook/context) so `success` carries everything downstream
 * components need without re-deriving it or re-parsing the file.
 *
 * A monotonically increasing request id guards against a stale
 * parse/analysis result (from a superseded file selection, or one that
 * resolves after `reset()`) overwriting newer state — the same pattern
 * `useLlmRequest` uses for its own async work.
 *
 * `onSuccess`, added in Phase 6 Milestone 6.2, is an optional callback fired
 * synchronously right after a successful parse+analysis is committed to
 * state (and guarded by the same stale-request check) — this is how
 * `useDatasetSession` persists a freshly uploaded dataset to IndexedDB
 * without this hook needing to know anything about storage. Kept as a
 * plain callback rather than baking persistence in here, so parsing/analysis
 * and persistence stay independently testable.
 */
export function useFileUpload(
  onSuccess?: (analysis: AnalysisResult, file: File) => void,
) {
  const [state, setState] = useState<UploadState>(INITIAL_STATE)
  const requestIdRef = useRef(0)

  const selectFile = useCallback((file: File) => {
    const requestId = ++requestIdRef.current

    const validationError = validateFileExtension(file)
    if (validationError) {
      setState({
        status: 'error',
        file: null,
        errorMessage: validationError,
        analysis: null,
      })
      return
    }

    // Captured now, at the start of processing, since nothing else tracks
    // when an upload began.
    const uploadedAt = Date.now()

    setState({ status: 'processing', file, errorMessage: null, analysis: null })

    void (async () => {
      try {
        const { table, meta } = await parseFileToArqueroTable(file)

        // Structural analysis first — numeric/quality/date analysis all
        // consume its ColumnMetadata[]. These run synchronously; by this
        // point the "processing" state above has already been committed
        // and painted (the `await` on the parser guarantees at least one
        // tick), so the UI shows a live "Processing..." status for the
        // full parse+analyze duration rather than looking frozen.
        const structural = analyzeStructure(table, file)
        const numeric = analyzeNumericColumns(table, structural.columns)
        const quality = analyzeDataQuality(table, structural.columns)
        const dates = analyzeDateColumns(table, structural.columns)

        if (requestIdRef.current !== requestId) return

        const analysis: AnalysisResult = {
          table,
          meta,
          structural,
          numeric,
          quality,
          dates,
          uploadedAt,
        }

        setState({ status: 'success', file, errorMessage: null, analysis })
        onSuccess?.(analysis, file)
      } catch (error) {
        if (requestIdRef.current !== requestId) return

        const errorMessage =
          error instanceof FileParseError
            ? error.message
            : error instanceof Error
              ? error.message
              : 'Something went wrong analyzing this file.'

        setState({
          status: 'error',
          file: null,
          errorMessage,
          analysis: null,
        })
      }
    })()
  }, [onSuccess])

  const reset = useCallback(() => {
    requestIdRef.current++
    setState(INITIAL_STATE)
  }, [])

  return { state, selectFile, reset }
}
