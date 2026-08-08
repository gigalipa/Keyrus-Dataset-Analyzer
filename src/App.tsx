import { AppShell } from './components/layout/AppShell'
import { FileUploadPanel } from './components/upload/FileUploadPanel'
import { ResultsView } from './components/results/ResultsView'
import { useFileUpload } from './hooks/useFileUpload'

function App() {
  const { state, selectFile, reset } = useFileUpload()
  const analysis = state.analysis

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <FileUploadPanel state={state} selectFile={selectFile} reset={reset} />

        {state.status === 'success' && analysis && state.file && (
          <ResultsView analysis={analysis} file={state.file} />
        )}
      </div>
    </AppShell>
  )
}

export default App
