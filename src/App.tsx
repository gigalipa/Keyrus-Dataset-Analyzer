import { useState } from 'react'
import { AppShell } from './components/layout/AppShell'
import { UploadModal } from './components/upload/UploadModal'
import { HistoryPanel } from './components/history/HistoryPanel'
import { MainViewport } from './components/layout/MainViewport'
import { LoadingOverlay } from './components/layout/LoadingOverlay'
import { useDatasetSession } from './hooks/useDatasetSession'
import { DEFAULT_SECTION, type AppSection } from './components/layout/sections'

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
    persistDataDictionary,
  } = useDatasetSession()

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
      activeSection={activeSection}
      onSelectSection={setActiveSection}
      onStartNewDataset={startNewDataset}
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
            onDictionaryGenerated={persistDataDictionary}
          />
        )}
      </div>

      {view.kind === 'loading' && (
        <LoadingOverlay statusText="Loading your workspace…" />
      )}

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
