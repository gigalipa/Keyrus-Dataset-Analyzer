/**
 * Session orchestrator hook — Phase 6, Milestone 6.2; Phase 8, Milestone 8.1.
 *
 * `useFileUpload` (Phase 5) only knows how to parse + analyze one file for
 * the lifetime of a tab; `src/lib/storage/db.ts` (Milestone 6.1) only knows
 * how to read/write `PersistedDataset` records; `runPipeline`
 * (`src/lib/pipeline/runPipeline.ts`, Milestone 8.1) only knows how to run
 * the four chained LLM steps for one dataset, given its current
 * `llmOutputs`. This hook is the thin layer that connects all three into the
 * actual product behavior beyond-MVP.md describes:
 *
 * - A freshly uploaded dataset is persisted the moment it finishes analysis
 *   (via `useFileUpload`'s `onSuccess` callback), then the pipeline runs
 *   automatically — no manual "Generate" click anywhere.
 * - On mount, the most recently uploaded dataset (if any) loads
 *   automatically from IndexedDB — no re-parsing, no modal. If none exists,
 *   the upload modal shows immediately. If the loaded dataset's pipeline
 *   didn't finish in a previous session (tab closed/crashed mid-sequence),
 *   it resumes automatically from wherever it left off.
 * - The History panel's list, dataset switching, and delete-with-
 *   auto-collapse-to-empty-state all live here so `App.tsx` and the panel
 *   component itself stay dumb/presentational.
 * - `persistLlmSlot`/`runPipelineForDataset` are the general mechanism that
 *   superseded Phase 7's one-off `persistDataDictionary`: every step of
 *   every run (auto-triggered or via `rerunAnalysis`) flows through the same
 *   path, so storage and view state can never drift between the four slots.
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
import { runPipeline, type PipelineStepName } from '../lib/pipeline/runPipeline'
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
       * display panels can render an already-generated result on mount
       * instead of showing a blank/loading state, and so `runPipeline` can
       * skip steps that already finished.
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
 * but `ResultsView` and its children (e.g. the pipeline's business-insights
 * step, which re-derives file size for its LLM prompt context) expect a real
 * `File`. Content bytes are zero-filled; only `name` and `size` need to be
 * honest.
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

/** `true` if any of the four LLM slots hasn't finished — used to decide whether a loaded dataset needs its pipeline resumed. */
function isPipelineIncomplete(llmOutputs: PersistedDataset['llmOutputs']): boolean {
  return Object.values(llmOutputs).some((slot) => slot.status !== 'done')
}

export function useDatasetSession() {
  const [view, setView] = useState<DatasetView>({ kind: 'loading' })
  const [history, setHistory] = useState<PersistedDatasetSummary[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [persistError, setPersistError] = useState<string | null>(null)
  const [pipelineRunning, setPipelineRunning] = useState(false)
  const [currentPipelineStep, setCurrentPipelineStep] =
    useState<PipelineStepName | null>(null)

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

  /**
   * Merges a full `llmOutputs` object into the given dataset's IndexedDB
   * record and, if that dataset is still the one on screen, mirrors it into
   * `view` state too. Takes the whole `llmOutputs` object (not one slot)
   * because `updateDataset`'s patch is a shallow merge — passing just one
   * slot would silently wipe out the other three's persisted state.
   */
  const persistLlmSlot = useCallback(
    (datasetId: string, llmOutputs: PersistedDataset['llmOutputs']) => {
      setView((current) =>
        current.kind === 'active' && current.datasetId === datasetId
          ? { ...current, llmOutputs }
          : current,
      )

      void updateDataset(datasetId, { llmOutputs }).catch((error) => {
        setPersistError(
          error instanceof Error
            ? error.message
            : 'Could not save analysis results to History.',
        )
      })
    },
    [],
  )

  /**
   * Runs `runPipeline` for one dataset, wiring its `onStepUpdate` callback
   * to `persistLlmSlot` (storage + view state) and to the
   * `pipelineRunning`/`currentPipelineStep` state exposed below for a later
   * milestone's stage-by-stage loading overlay. `initialLlmOutputs` is
   * whatever the pipeline should treat as "already done" — the dataset's
   * real persisted state for an auto-triggered run/resume, or four fresh
   * `'pending'` slots for `rerunAnalysis`'s "start over" behavior.
   */
  const runPipelineForDataset = useCallback(
    async (
      datasetId: string,
      file: File,
      analysis: AnalysisResult,
      initialLlmOutputs: PersistedDataset['llmOutputs'],
    ) => {
      let llmOutputsSnapshot = initialLlmOutputs
      setPipelineRunning(true)
      try {
        await runPipeline({
          table: analysis.table,
          file,
          structural: analysis.structural,
          quality: analysis.quality,
          datasetName: file.name,
          llmOutputs: initialLlmOutputs,
          onStepUpdate: (step, slot) => {
            llmOutputsSnapshot = { ...llmOutputsSnapshot, [step]: slot }
            setCurrentPipelineStep(slot.status === 'running' ? step : null)
            persistLlmSlot(datasetId, llmOutputsSnapshot)
          },
        })
      } finally {
        setPipelineRunning(false)
        setCurrentPipelineStep(null)
      }
    },
    [persistLlmSlot],
  )

  /** Kicks off the pipeline for a just-hydrated view if any of its four slots isn't `'done'` yet — covers both fresh-upload and resume-on-reload. */
  const maybeResumePipeline = useCallback(
    (activeView: ActiveDatasetView, llmOutputs: PersistedDataset['llmOutputs']) => {
      if (!isPipelineIncomplete(llmOutputs)) return
      void runPipelineForDataset(
        activeView.datasetId,
        activeView.file,
        activeView.analysis,
        llmOutputs,
      )
    },
    [runPipelineForDataset],
  )

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
          // Auto-trigger the chained pipeline right after the initial
          // pending record is persisted, using the in-memory `analysis`
          // already on hand — no need to re-read it back from IndexedDB.
          void runPipelineForDataset(id, file, analysis, record.llmOutputs)
        } catch (error) {
          setPersistError(
            error instanceof Error
              ? error.message
              : 'Could not save this dataset to History.',
          )
        }
      })()
    },
    [refreshHistory, runPipelineForDataset],
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
      const activeView = await hydrateRecordIntoView(newest)
      if (cancelled) return
      setView(activeView)
      maybeResumePipeline(activeView, newest.llmOutputs)
    })()
    return () => {
      cancelled = true
    }
    // Intentionally runs once on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openHistory = useCallback(() => {
    void refreshHistory()
    setHistoryOpen(true)
  }, [refreshHistory])

  const closeHistory = useCallback(() => setHistoryOpen(false), [])

  const selectDataset = useCallback(
    async (id: string) => {
      const record = await getDataset(id)
      if (!record) return
      setPreUploadView(null)
      const activeView = await hydrateRecordIntoView(record)
      setView(activeView)
      setHistoryOpen(false)
      maybeResumePipeline(activeView, record.llmOutputs)
    },
    [maybeResumePipeline],
  )

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
   * The single "Re-run analysis" affordance (per the roadmap, replacing the
   * old per-panel "Regenerate" buttons): re-invokes the pipeline for the
   * active dataset from scratch, treating all four slots as needing a fresh
   * run regardless of their current `'done'` status — a real retry, not a
   * resume.
   */
  const rerunAnalysis = useCallback(() => {
    if (view.kind !== 'active') return
    void runPipelineForDataset(
      view.datasetId,
      view.file,
      view.analysis,
      createPendingLlmOutputs(),
    )
  }, [view, runPipelineForDataset])

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
    /** `true` while any pipeline step is in flight for the active dataset (auto-triggered or via `rerunAnalysis`) — for a future stage-by-stage loading overlay (Milestone 8.2). */
    pipelineRunning,
    /** The step currently running, or `null` when idle/between steps — same future-overlay purpose as `pipelineRunning`. */
    currentPipelineStep,
    rerunAnalysis,
  }
}
