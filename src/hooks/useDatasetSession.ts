/**
 * Session orchestrator hook — Phase 6, Milestone 6.2.
 *
 * `useFileUpload` (Phase 5) only knows how to parse + analyze one file for
 * the lifetime of a tab; `src/lib/storage/db.ts` (Milestone 6.1) only knows
 * how to read/write `PersistedDataset` records. Neither knows about the
 * other. This hook is the thin layer that connects them into the actual
 * product behavior beyond-MVP.md describes:
 *
 * - A freshly uploaded dataset is persisted the moment it finishes
 *   analysis (via `useFileUpload`'s `onSuccess` callback).
 * - On mount, the most recently uploaded dataset (if any) loads
 *   automatically from IndexedDB — no re-parsing, no modal. If none exists,
 *   the upload modal shows immediately.
 * - The History panel's list, dataset switching, and delete-with-
 *   auto-collapse-to-empty-state all live here so `App.tsx` and the panel
 *   component itself stay dumb/presentational.
 *
 * Deliberately does NOT touch `llmOutputs` beyond what
 * `createPendingLlmOutputs()` already sets up — Phase 8 owns running that
 * pipeline; this hook only ever persists/reads slots, never executes them.
 */
import { useCallback, useEffect, useState } from 'react'
import type { AnalysisResult } from '../types/upload'
import type {
  PersistedDataset,
  PersistedDatasetSummary,
} from '../types/persistedDataset'
import {
  createPendingLlmOutputs,
  hydrateCleanedTable,
  serializeCleanedTable,
} from '../types/persistedDataset'
import {
  createDataset,
  deleteDataset as deleteDatasetRecord,
  getDataset,
  listDatasets,
  updateDataset,
} from '../lib/storage/db'
import type { InsightGroup } from '../lib/llm/schema'
import { useFileUpload } from './useFileUpload'

/** What the center viewport should currently show. */
export type DatasetView =
  | { kind: 'loading' }
  | { kind: 'upload' }
  | {
      kind: 'active'
      datasetId: string
      file: File
      analysis: AnalysisResult
      /**
       * The dataset record's persisted LLM outputs — carried through so
       * components (e.g. `DataDictionaryPanel`) can seed themselves from an
       * already-generated result on mount instead of unconditionally
       * regenerating, which was producing a real bug: switching between two
       * previously-analyzed datasets re-ran the data dictionary's LLM call
       * every single time, because each switch built a brand-new
       * `AnalysisResult` object with no memory of a prior generation.
       */
      llmOutputs: PersistedDataset['llmOutputs']
    }

type ActiveDatasetView = Extract<DatasetView, { kind: 'active' }>

/** Rebuilds an `AnalysisResult`-shaped object from a stored record, without re-parsing or re-analyzing anything. */
function hydrateAnalysis(record: PersistedDataset): AnalysisResult {
  return {
    table: hydrateCleanedTable(record.cleanedTable),
    meta: record.rawTable,
    structural: record.analysis.structural,
    numeric: record.analysis.numeric,
    quality: record.analysis.quality,
    dates: record.analysis.dates,
    uploadedAt: record.uploadedAt,
  }
}

/**
 * Reconstructs a `File`-like object for a dataset loaded from storage — the
 * original `File` itself is never persisted (only its parsed contents are),
 * but `ResultsView` and its children (e.g. `BusinessInsightsPanel`, which
 * re-derives file size for its LLM prompt context) expect a real `File`.
 * Content bytes are zero-filled; only `name` and `size` need to be honest.
 */
function makeSyntheticFile(fileName: string, fileSizeMB: number): File {
  const byteLength = Math.max(0, Math.round(fileSizeMB * 1024 * 1024))
  return new File([new Uint8Array(byteLength)], fileName)
}

async function hydrateRecordIntoView(record: PersistedDataset): Promise<ActiveDatasetView> {
  const analysis = hydrateAnalysis(record)
  const file = makeSyntheticFile(record.fileName, record.analysis.structural.stats.fileSizeMB)
  return {
    kind: 'active',
    datasetId: record.id,
    file,
    analysis,
    llmOutputs: record.llmOutputs,
  }
}

export function useDatasetSession() {
  const [view, setView] = useState<DatasetView>({ kind: 'loading' })
  const [history, setHistory] = useState<PersistedDatasetSummary[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [persistError, setPersistError] = useState<string | null>(null)

  // Snapshot of the active dataset to restore if the user opens "New
  // dataset" and then dismisses the upload modal without uploading
  // anything. Only ever set while `view.kind === 'upload'`.
  const [preUploadView, setPreUploadView] = useState<ActiveDatasetView | null>(
    null,
  )

  const refreshHistory = useCallback(async () => {
    const summaries = await listDatasets()
    setHistory(summaries)
    return summaries
  }, [])

  const handleUploadSuccess = useCallback(
    (analysis: AnalysisResult, file: File) => {
      const id = crypto.randomUUID()
      const record: PersistedDataset = {
        id,
        fileName: file.name,
        uploadedAt: analysis.uploadedAt,
        rawTable: analysis.meta,
        cleanedTable: serializeCleanedTable(analysis.table),
        analysis: {
          structural: analysis.structural,
          numeric: analysis.numeric,
          quality: analysis.quality,
          dates: analysis.dates,
        },
        llmOutputs: createPendingLlmOutputs(),
      }

      setPreUploadView(null)
      // Show the result immediately using the in-memory analysis (no
      // reload/rehydrate round trip needed) — persistence happens
      // alongside, not as a precondition for the user seeing their data.
      setView({
        kind: 'active',
        datasetId: id,
        file,
        analysis,
        llmOutputs: record.llmOutputs,
      })
      setPersistError(null)

      void (async () => {
        try {
          await createDataset(record)
          await refreshHistory()
        } catch (error) {
          setPersistError(
            error instanceof Error
              ? error.message
              : 'Could not save this dataset to History.',
          )
        }
      })()
    },
    [refreshHistory],
  )

  const {
    state: uploadState,
    selectFile,
    reset: resetUpload,
  } = useFileUpload(handleUploadSuccess)

  // Initial load: skip the modal and jump straight to the most recently
  // uploaded dataset if one exists; otherwise show the upload modal.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const summaries = await listDatasets()
      if (cancelled) return
      setHistory(summaries)

      if (summaries.length === 0) {
        setView({ kind: 'upload' })
        return
      }

      const newest = await getDataset(summaries[0].id)
      if (cancelled) return
      if (!newest) {
        setView({ kind: 'upload' })
        return
      }
      setView(await hydrateRecordIntoView(newest))
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const openHistory = useCallback(() => {
    void refreshHistory()
    setHistoryOpen(true)
  }, [refreshHistory])

  const closeHistory = useCallback(() => setHistoryOpen(false), [])

  const selectDataset = useCallback(async (id: string) => {
    const record = await getDataset(id)
    if (!record) return
    setPreUploadView(null)
    setView(await hydrateRecordIntoView(record))
    setHistoryOpen(false)
  }, [])

  /** "New dataset" — from the History panel, or the initial empty state. */
  const startNewDataset = useCallback(() => {
    setPreUploadView(view.kind === 'active' ? view : null)
    setView({ kind: 'upload' })
    setHistoryOpen(false)
    resetUpload()
    setPersistError(null)
  }, [resetUpload, view])

  /** Cancels out of the upload modal back to whatever was showing before, when that's possible. */
  const cancelUpload = useCallback(() => {
    if (!preUploadView) return
    setView(preUploadView)
    setPreUploadView(null)
    resetUpload()
  }, [resetUpload, preUploadView])

  /**
   * Persists a freshly-generated data dictionary to the active dataset's
   * IndexedDB record (`llmOutputs.dataDictionary`) and mirrors it into local
   * `view` state, so a later switch away and back to this same dataset can
   * seed `DataDictionaryPanel` from storage instead of regenerating it.
   */
  const persistDataDictionary = useCallback((data: InsightGroup) => {
    setView((current) => {
      if (current.kind !== 'active') return current
      const nextLlmOutputs: PersistedDataset['llmOutputs'] = {
        ...current.llmOutputs,
        dataDictionary: { status: 'done', data },
      }

      void updateDataset(current.datasetId, {
        llmOutputs: nextLlmOutputs,
      }).catch((error) => {
        setPersistError(
          error instanceof Error
            ? error.message
            : 'Could not save the data dictionary to History.',
        )
      })

      return { ...current, llmOutputs: nextLlmOutputs }
    })
  }, [])

  const removeDataset = useCallback(
    async (id: string) => {
      await deleteDatasetRecord(id)
      const remaining = await refreshHistory()

      if (remaining.length === 0) {
        setPreUploadView(null)
        setHistoryOpen(false)
        setView({ kind: 'upload' })
        return
      }

      // If the deleted dataset was the one currently on screen, fall back
      // to the newest remaining one rather than leaving a deleted
      // dataset's data on screen.
      if (view.kind === 'active' && view.datasetId === id) {
        await selectDataset(remaining[0].id)
      }
    },
    [refreshHistory, selectDataset, view],
  )

  return {
    view,
    uploadState,
    selectFile,
    /** Plain reset of the underlying upload state machine — e.g. "choose a different file" while the modal is already open. Distinct from `startNewDataset`, which also handles entering the upload view from an active dataset. */
    resetUpload,
    persistError,
    history,
    historyOpen,
    openHistory,
    closeHistory,
    selectDataset,
    startNewDataset,
    cancelUpload,
    canCancelUpload: preUploadView !== null,
    removeDataset,
    persistDataDictionary,
  }
}
