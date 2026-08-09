import { useState } from 'react'
import { AppShell } from './components/layout/AppShell'
import { UploadModal } from './components/upload/UploadModal'
import { HistoryPanel } from './components/history/HistoryPanel'
import { MainViewport } from './components/layout/MainViewport'
import { LoadingOverlay } from './components/layout/LoadingOverlay'
import { useDatasetSession } from './hooks/useDatasetSession'
import { DEFAULT_SECTION, type AppSection } from './components/layout/sections'
import type { PipelineStepName } from './lib/pipeline/runPipeline'

/** Stage-by-stage status line shown under the overlay's spinner for each LLM pipeline step (Phase 8, Milestone 8.2). */
const PIPELINE_STEP_STATUS: Record<PipelineStepName, string> = {
  dataDictionary: 'Understanding data...',
  businessInsights: 'Generating KPIs...',
  explanation: 'Explaining business insights...',
  clientQuestions: 'Preparing client questions...',
}

function App() {
  const {
    view,
    uploadState,
    selectFile,
    resetUpload,
    persistError,
    history,
    historyOpen,
    openHistory,
    closeHistory,
    selectDataset,
    startNewDataset,
    cancelUpload,
    canCancelUpload,
    removeDataset,
    pipelineRunning,
    currentPipelineStep,
    rerunAnalysis,
  } = useDatasetSession()

  // Per beyond-MVP.md: "everything locks under a loading overlay" from the
  // moment a file is selected through every pipeline step finishing — not
  // just the one-time initial IndexedDB-hydration check. Covers three
  // distinct phases that can each independently be true: the initial mount
  // check (`view.kind === 'loading'`), the parse + Phase 3 analysis phase
  // that runs before the LLM pipeline starts (`uploadState.status ===
  // 'processing'`), and any of the four LLM pipeline steps in flight
  // (`pipelineRunning`) — whether auto-triggered after upload, resumed after
  // a reload, or from "Re-run analysis".
  const showLoadingOverlay =
    view.kind === 'loading' || uploadState.status === 'processing' || pipelineRunning

  const loadingStatusText =
    view.kind === 'loading'
      ? 'Loading your workspace…'
      : uploadState.status === 'processing'
        ? 'Understanding data...'
        : currentPipelineStep
          ? PIPELINE_STEP_STATUS[currentPipelineStep]
          // pipelineRunning is true but currentPipelineStep is momentarily
          // null (between steps) — keep the overlay up with a generic line
          // rather than flashing/disappearing.
          : 'Analyzing your data...'

  // Transient nav state — which of the 8 sidebar sections is active. Not
  // persisted (unlike dataset state): a page reload always lands back on
  // the default section. See Sidebar.tsx / sections.ts (Phase 7, Milestone
  // 7.2). Its value is meaningless while no dataset is active.
  const [activeSection, setActiveSection] = useState<AppSection>(DEFAULT_SECTION)

  const activeDatasetId = view.kind === 'active' ? view.datasetId : null

  return (
    <AppShell
      historyCount={history.length}
      onOpenHistory={openHistory}
      hasActiveDataset={view.kind === 'active'}
      llmOutputs={view.kind === 'active' ? view.llmOutputs : undefined}
      activeSection={activeSection}
      onSelectSection={setActiveSection}
      onStartNewDataset={startNewDataset}
      onRerunAnalysis={rerunAnalysis}
    >
      <div className="flex flex-col gap-6">
        {persistError && (
          <div
            role="alert"
            className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
          >
            This dataset is showing, but couldn't be saved to History:{' '}
            {persistError}
          </div>
        )}

        {view.kind === 'active' && (
          <MainViewport
            activeSection={activeSection}
            datasetId={view.datasetId}
            analysis={view.analysis}
            file={view.file}
            llmOutputs={view.llmOutputs}
          />
        )}
      </div>

      {showLoadingOverlay && <LoadingOverlay statusText={loadingStatusText} />}

      {view.kind === 'upload' && (
        <UploadModal
          state={uploadState}
          selectFile={selectFile}
          reset={resetUpload}
          onDismiss={canCancelUpload ? cancelUpload : undefined}
        />
      )}

      <HistoryPanel
        open={historyOpen}
        datasets={history}
        activeDatasetId={activeDatasetId}
        onClose={closeHistory}
        onSelect={(id) => void selectDataset(id)}
        onDelete={(id) => void removeDataset(id)}
        onNewDataset={startNewDataset}
      />
    </AppShell>
  )
}

export default App
