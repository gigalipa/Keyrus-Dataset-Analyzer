import { AppShell } from './components/layout/AppShell'
import { UploadModal } from './components/upload/UploadModal'
import { ResultsView } from './components/results/ResultsView'
import { HistoryPanel } from './components/history/HistoryPanel'
import { useDatasetSession } from './hooks/useDatasetSession'

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
  } = useDatasetSession()

  const activeDatasetId = view.kind === 'active' ? view.datasetId : null

  return (
    <AppShell historyCount={history.length} onOpenHistory={openHistory}>
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

        {view.kind === 'loading' && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Loading...
          </p>
        )}

        {view.kind === 'active' && (
          <ResultsView analysis={view.analysis} file={view.file} />
        )}
      </div>

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
