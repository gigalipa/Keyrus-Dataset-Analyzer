import type { UploadState } from '../../types/upload'
import { FileDropzone } from './FileDropzone'
import { UploadStatusBanner } from './UploadStatusBanner'

interface FileUploadPanelProps {
  state: UploadState
  selectFile: (file: File) => void
  reset: () => void
}

/**
 * Composes the dataset drop zone with its live status banner. The upload
 * state machine itself (real parsing + Phase 3 analysis, via
 * `useFileUpload`) is owned by the parent (`App.tsx`) so the resulting
 * `AnalysisResult` can also be handed to the Milestone 5.1 results
 * components rendered alongside this panel.
 *
 * Phase 1's standalone preview (first-100-rows table + summary bar) was
 * removed once Phase 5 wired in the real pipeline: `ResultsView`'s Overview
 * tab (`DataOverviewCard` + `ColumnDetailView`) now shows the same
 * information from the same real `AnalysisResult`, without a second,
 * redundant re-parse of the file.
 */
export function FileUploadPanel({
  state,
  selectFile,
  reset,
}: FileUploadPanelProps) {
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
    </section>
  )
}
