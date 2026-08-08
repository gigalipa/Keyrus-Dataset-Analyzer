import { useFileUpload } from '../../hooks/useFileUpload'
import { DataPreviewSection } from '../preview/DataPreviewSection'
import { FileDropzone } from './FileDropzone'
import { UploadStatusBanner } from './UploadStatusBanner'

/**
 * Composes the dataset drop zone with its live status banner and drives the
 * upload state machine. Parsing is stubbed with a short simulated delay
 * until Phase 2 wires in real CSV/TSV/XLS/XLSX/SQL parsing.
 */
export function FileUploadPanel() {
  const { state, selectFile, reset } = useFileUpload()
  const isProcessing = state.status === 'processing'

  return (
    <section
      aria-labelledby="upload-heading"
      className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 dark:border-slate-800 dark:bg-slate-900"
    >
      <div>
        <h2
          id="upload-heading"
          className="text-lg font-semibold text-slate-900 dark:text-slate-100"
        >
          Upload a dataset
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Drop a client export below to get a quick, honest read on what's
          inside.
        </p>
      </div>

      <FileDropzone
        onFileSelected={selectFile}
        selectedFileName={state.file?.name ?? null}
        disabled={isProcessing}
      />

      <UploadStatusBanner
        status={state.status}
        fileName={state.file?.name ?? null}
        errorMessage={state.errorMessage}
      />

      {state.status !== 'idle' && (
        <button
          type="button"
          onClick={reset}
          disabled={isProcessing}
          className="self-start text-sm font-medium text-blue-600 underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:text-slate-400 disabled:no-underline dark:text-blue-400 dark:disabled:text-slate-600"
        >
          Choose a different file
        </button>
      )}

      {state.status === 'success' && state.file && (
        <DataPreviewSection file={state.file} />
      )}
    </section>
  )
}
