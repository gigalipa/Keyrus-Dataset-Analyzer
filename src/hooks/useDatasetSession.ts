/**
 * Session orchestrator hook — Phase 6, Milestone 6.2; Phase 8, Milestone 8.1;
 * reordered around real cleaning in Phase 10, Milestone 10.3.
 *
 * `useFileUpload` (Phase 5) only knows how to parse + run structural
 * analysis for one file for the lifetime of a tab; `src/lib/storage/db.ts`
 * (Milestone 6.1) only knows how to read/write `PersistedDataset` records;
 * `runPipeline` (`src/lib/pipeline/runPipeline.ts`, Milestone 8.1, reordered
 * 10.3) only knows how to run the full chained sequence for one dataset,
 * given its current per-step `StepSlot`s. This hook is the thin layer that
 * connects all three into the actual product behavior beyond-MVP.md
 * describes:
 *
 * - A freshly uploaded dataset is persisted the moment structural analysis
 *   finishes (via `useFileUpload`'s `onSuccess` callback), then the pipeline
 *   runs automatically — no manual "Generate" click anywhere. The dataset
 *   view goes `'active'` immediately with real structural stats but
 *   placeholder (empty) `numeric`/`quality`/`dates` — the pipeline's `clean`
 *   and `eda` steps update `view.analysis`'s `table`/`numeric`/`quality`/
 *   `dates` in place once they finish, so the UI never shows stale
 *   raw-table EDA numbers, only "not analyzed yet" (briefly, behind the
 *   loading overlay) or the real post-clean result.
 * - On mount, the most recently uploaded dataset (if any) loads
 *   automatically from IndexedDB — no re-parsing, no modal. If none exists,
 *   the upload modal shows immediately. If the loaded dataset's pipeline
 *   didn't finish in a previous session (tab closed/crashed mid-sequence),
 *   it resumes automatically from wherever it left off — at *any* of the
 *   pipeline's stages, not just the four original LLM steps.
 * - The History panel's list, dataset switching, and delete-with-
 *   auto-collapse-to-empty-state all live here so `App.tsx` and the panel
 *   component itself stay dumb/presentational.
 * - `persistDatasetPatch`/`runPipelineForDataset` are the general mechanism
 *   every step of every run (auto-triggered or via `rerunAnalysis`) flows
 *   through, so storage and view state can never drift between the seven
 *   steps' worth of persisted state.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { AnalysisResult } from '../types/upload'
import type {
  PersistedDataset,
  PersistedDatasetSummary,
} from '../types/persistedDataset'
import {
  createPendingLlmOutputs,
  createPendingPipelineExtras,
  hydrateCleanedTable,
  hydrateRawTable,
  isDatasetPipelineIncomplete,
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
      /**
       * The dataset record's persisted audit trail slot (Milestone 10.2/10.3)
       * — carried through the same way `llmOutputs` is so Milestone 10.5's
       * "how issues were managed" section can render an already-computed
       * audit trail on mount, and so it stays live as the `clean` pipeline
       * step finishes for a freshly uploaded dataset.
       */
      cleaning: PersistedDataset['cleaning']
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
    cleaning: record.cleaning,
  }
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
   * Per-dataset write queue for `persistDatasetPatch` below. `updateDataset`
   * reads the existing record, merges the patch, then writes — outside any
   * single IndexedDB transaction (see its own doc comment) — so two
   * `updateDataset` calls for the same dataset fired back-to-back without
   * awaiting each other can race: the second's read can happen before the
   * first's write commits, and whichever write actually lands last "wins,"
   * even if it started first. That was latent but harmless for the four
   * original LLM steps (seconds-long gaps between their `'running'` and
   * `'done'` updates made racing practically impossible), but Milestone
   * 10.2/10.3's `clean`/`eda` steps are synchronous — their `'running'` and
   * `'done'` updates fire in the same tick, and without this queue the
   * `'running'` write can occasionally land *after* the `'done'` write,
   * permanently stranding the persisted record on `'running'` and making
   * every future reload think the pipeline is still unfinished. Chaining
   * every write for a given dataset off the previous one's settlement
   * (success or failure) guarantees they always apply in the order they
   * were issued.
   */
  const writeQueueRef = useRef<Map<string, Promise<unknown>>>(new Map())

  /**
   * Applies a partial patch to the given dataset's IndexedDB record. Used by
   * every step's `onStepUpdate` handler below (LLM or not) to persist
   * exactly the field(s) that step owns, without clobbering the rest of the
   * record — `updateDataset`'s patch is a shallow merge, so passing only the
   * changed field(s) is both correct and cheaper than round-tripping the
   * whole record. Queued per-dataset (see `writeQueueRef`'s doc comment) so
   * rapid-fire patches — notably `clean`/`eda`'s same-tick `'running'` ->
   * `'done'` pair — always apply in issue order.
   */
  const persistDatasetPatch = useCallback(
    (datasetId: string, patch: Partial<PersistedDataset>) => {
      const previous = writeQueueRef.current.get(datasetId) ?? Promise.resolve()
      const next = previous
        .catch(() => {
          // Swallow the previous write's rejection here so it doesn't
          // short-circuit this write too — its own error was already
          // reported via `setPersistError` below when it happened.
        })
        .then(() => updateDataset(datasetId, patch))
        .catch((error) => {
          setPersistError(
            error instanceof Error
              ? error.message
              : 'Could not save analysis results to History.',
          )
        })
      writeQueueRef.current.set(datasetId, next)
    },
    [],
  )

  /** Mirrors a change into `view` state, but only if `datasetId` is still the one on screen (a user could switch datasets mid-run). */
  const patchActiveView = useCallback(
    (datasetId: string, updater: (current: ActiveDatasetView) => ActiveDatasetView) => {
      setView((current) =>
        current.kind === 'active' && current.datasetId === datasetId
          ? updater(current)
          : current,
      )
    },
    [],
  )

  /**
   * Runs `runPipeline` for one dataset, wiring its `onStepUpdate` callback to
   * persist + mirror progress for every step — the four LLM output slots
   * (`llmOutputs`), Milestone 10.1's `cleaningPlan` slot, and Milestone
   * 10.2/10.3's `cleaning`/`eda` slots. The `clean` and `eda` steps also
   * carry the freshly cleaned table / freshly computed EDA result
   * respectively, which get folded into both the persisted `cleanedTable`/
   * `analysis` fields and the live `view.analysis` the UI renders from — this
   * is what makes "EDA numbers reflect the cleaned table" visible on screen,
   * not just in storage.
   *
   * `initial` is whatever the pipeline should treat as "already done" — the
   * dataset's real persisted state for an auto-triggered run/resume, or all
   * fresh `'pending'` slots for `rerunAnalysis`'s "start over" behavior.
   */
  const runPipelineForDataset = useCallback(
    async (
      datasetId: string,
      file: File,
      analysis: AnalysisResult,
      initial: {
        llmOutputs: PersistedDataset['llmOutputs']
        cleaningPlan: PersistedDataset['cleaningPlan']
        cleaning: PersistedDataset['cleaning']
        eda: PersistedDataset['eda']
      },
    ) => {
      let llmOutputsSnapshot = initial.llmOutputs

      setPipelineRunning(true)
      try {
        await runPipeline({
          // `meta` is always the true, untouched raw parse (Phase 6's
          // contract) regardless of how far cleaning has progressed —
          // rehydrated fresh here so `rerunAnalysis` genuinely restarts from
          // raw data, not from whatever `analysis.table` currently holds.
          rawTable: hydrateRawTable(analysis.meta),
          file,
          structural: analysis.structural,
          datasetName: file.name,
          llmOutputs: initial.llmOutputs,
          cleaningPlan: initial.cleaningPlan,
          cleaning: initial.cleaning,
          eda: initial.eda,
          // The dataset's current best table/EDA — identical to raw if
          // cleaning/EDA haven't run yet, or the real post-clean result if
          // resuming past them.
          cleanedTable: analysis.table,
          analysis: {
            numeric: analysis.numeric,
            quality: analysis.quality,
            dates: analysis.dates,
          },
          onStepUpdate: (update) => {
            setCurrentPipelineStep(update.slot.status === 'running' ? update.step : null)

            switch (update.step) {
              case 'dataDictionary':
              case 'businessInsights':
              case 'explanation':
              case 'clientQuestions': {
                llmOutputsSnapshot = {
                  ...llmOutputsSnapshot,
                  [update.step]: update.slot,
                } as PersistedDataset['llmOutputs']
                patchActiveView(datasetId, (current) => ({
                  ...current,
                  llmOutputs: llmOutputsSnapshot,
                }))
                persistDatasetPatch(datasetId, { llmOutputs: llmOutputsSnapshot })
                break
              }
              case 'planCleaning': {
                persistDatasetPatch(datasetId, {
                  cleaningPlan: update.slot as PersistedDataset['cleaningPlan'],
                })
                break
              }
              case 'clean': {
                const cleaningSlot = update.slot as PersistedDataset['cleaning']
                const patch: Partial<PersistedDataset> = {
                  cleaning: cleaningSlot,
                }
                patchActiveView(datasetId, (current) => ({
                  ...current,
                  cleaning: cleaningSlot,
                  analysis: update.cleanedTable
                    ? { ...current.analysis, table: update.cleanedTable }
                    : current.analysis,
                }))
                if (update.cleanedTable) {
                  patch.cleanedTable = serializeCleanedTable(update.cleanedTable)
                }
                persistDatasetPatch(datasetId, patch)
                break
              }
              case 'eda': {
                const patch: Partial<PersistedDataset> = {
                  eda: update.slot as PersistedDataset['eda'],
                }
                if (update.eda) {
                  const { numeric, quality, dates } = update.eda
                  patch.analysis = {
                    structural: analysis.structural,
                    numeric,
                    quality,
                    dates,
                  }
                  patchActiveView(datasetId, (current) => ({
                    ...current,
                    analysis: { ...current.analysis, numeric, quality, dates },
                  }))
                }
                persistDatasetPatch(datasetId, patch)
                break
              }
            }
          },
        })
      } finally {
        setPipelineRunning(false)
        setCurrentPipelineStep(null)
      }
    },
    [patchActiveView, persistDatasetPatch],
  )

  /** Kicks off the pipeline for a just-hydrated view if any step isn't `'done'` yet — covers both fresh-upload and resume-on-reload, at any stage. */
  const maybeResumePipeline = useCallback(
    (activeView: ActiveDatasetView, record: PersistedDataset) => {
      if (!isDatasetPipelineIncomplete(record)) return
      void runPipelineForDataset(activeView.datasetId, activeView.file, activeView.analysis, {
        llmOutputs: record.llmOutputs,
        cleaningPlan: record.cleaningPlan,
        cleaning: record.cleaning,
        eda: record.eda,
      })
    },
    [runPipelineForDataset],
  )

  const handleUploadSuccess = useCallback(
    (analysis: AnalysisResult, file: File) => {
      const id = crypto.randomUUID()
      const pendingExtras = createPendingPipelineExtras()
      const record: PersistedDataset = {
        id,
        fileName: file.name,
        uploadedAt: analysis.uploadedAt,
        rawTable: analysis.meta,
        // No cleaning has happened yet — honestly identical to the raw
        // parse until the `clean` step actually runs (see
        // `PersistedDataset.cleanedTable`'s doc comment).
        cleanedTable: serializeCleanedTable(analysis.table),
        analysis: {
          structural: analysis.structural,
          numeric: analysis.numeric,
          quality: analysis.quality,
          dates: analysis.dates,
        },
        ...pendingExtras,
        llmOutputs: createPendingLlmOutputs(),
      }

      setPreUploadView(null)
      // Show the result immediately using the in-memory analysis (no
      // reload/rehydrate round trip needed) — persistence happens
      // alongside, not as a precondition for the user seeing their data.
      // `analysis.numeric`/`quality`/`dates` are still `useFileUpload`'s
      // honest empty placeholders at this point; the pipeline's `clean` and
      // `eda` steps replace them in place once they finish.
      setView({
        kind: 'active',
        datasetId: id,
        file,
        analysis,
        llmOutputs: record.llmOutputs,
        cleaning: record.cleaning,
      })
      setPersistError(null)

      void (async () => {
        try {
          await createDataset(record)
          await refreshHistory()
          // Auto-trigger the chained pipeline right after the initial
          // pending record is persisted, using the in-memory `analysis`
          // already on hand — no need to re-read it back from IndexedDB.
          void runPipelineForDataset(id, file, analysis, {
            llmOutputs: record.llmOutputs,
            cleaningPlan: record.cleaningPlan,
            cleaning: record.cleaning,
            eda: record.eda,
          })
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
      maybeResumePipeline(activeView, newest)
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
      maybeResumePipeline(activeView, record)
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
   * active dataset from scratch, treating every step (the four LLM slots
   * plus Milestone 10.1-10.3's `cleaningPlan`/`cleaning`/`eda`) as needing a
   * fresh run regardless of current status — a real retry from raw data, not
   * a resume. `runPipelineForDataset` always re-derives the raw table from
   * `analysis.meta` (see its doc comment), so this genuinely re-cleans from
   * scratch rather than re-cleaning an already-cleaned table.
   */
  const rerunAnalysis = useCallback(() => {
    if (view.kind !== 'active') return
    void runPipelineForDataset(view.datasetId, view.file, view.analysis, {
      llmOutputs: createPendingLlmOutputs(),
      ...createPendingPipelineExtras(),
    })
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
    /** `true` while any pipeline step is in flight for the active dataset (auto-triggered or via `rerunAnalysis`) — for the stage-by-stage loading overlay (Milestone 8.2, extended 10.3). */
    pipelineRunning,
    /** The step currently running, or `null` when idle/between steps — same overlay purpose as `pipelineRunning`. */
    currentPipelineStep,
    rerunAnalysis,
  }
}
