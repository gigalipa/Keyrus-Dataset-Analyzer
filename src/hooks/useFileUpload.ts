import { useCallback, useRef, useState } from 'react'
import type { AnalysisResult, UploadState } from '../types/upload'
import { validateFileExtension } from '../utils/fileValidation'
import { parseFileToArqueroTable, FileParseError } from '../lib/parsers'
import { analyzeStructure } from '../lib/analysis/structural'
import { emptyDataQualityReport } from '../lib/analysis/quality'

const INITIAL_STATE: UploadState = {
  status: 'idle',
  file: null,
  errorMessage: null,
  analysis: null,
}

/**
 * Drives the upload state machine: idle -> processing -> success | error.
 *
 * Phase 5, Milestone 5.1 originally ran all four Phase 3 analysis passes
 * here, synchronously, before ever reaching `'success'`. Phase 10, Milestone
 * 10.3 shrank that: this hook now parses the file
 * (`parseFileToArqueroTable`, Phase 2) and runs only structural analysis
 * (`analyzeStructure`) before transitioning to `'success'` — numeric/
 * quality/date analysis (Milestones 3.2-3.4) now run later in the real
 * pipeline (`runPipeline.ts`'s `eda` step), against the *cleaned* table
 * produced by the new understand-and-plan + ETL-clean steps, not the raw
 * parse this hook sees. The `AnalysisResult` this hook hands back still
 * carries `numeric`/`quality`/`dates` fields (so downstream types/components
 * don't need nullable variants), but they're honest, empty placeholders
 * (`[]` / `emptyDataQualityReport()`) until `runPipeline` fills them in with
 * the real post-clean result — see `useDatasetSession.ts`'s `onStepUpdate`
 * handling of the `eda` step, which is the only place these fields are ever
 * replaced after this hook hands off.
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

        // Structural analysis only — the real pipeline (`runPipeline.ts`)
        // runs numeric/quality/date analysis later, against the cleaned
        // table. Synchronous; by this point the "processing" state above has
        // already been committed and painted (the `await` on the parser
        // guarantees at least one tick), so the UI shows a live
        // "Processing..." status for the full parse+structural-analyze
        // duration rather than looking frozen.
        const structural = analyzeStructure(table, file)

        if (requestIdRef.current !== requestId) return

        const analysis: AnalysisResult = {
          table,
          meta,
          structural,
          // Honest placeholders — replaced in place once the pipeline's
          // `eda` step runs against the cleaned table (see module doc).
          numeric: [],
          quality: emptyDataQualityReport(),
          dates: [],
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
