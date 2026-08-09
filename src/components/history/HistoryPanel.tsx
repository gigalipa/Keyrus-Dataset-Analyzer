import { useEffect, useRef } from 'react'
import type { PersistedDatasetSummary } from '../../types/persistedDataset'
import { formatTimestamp } from '../../utils/formatTimestamp'

interface HistoryPanelProps {
  open: boolean
  datasets: PersistedDatasetSummary[]
  activeDatasetId: string | null
  onClose: () => void
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onNewDataset: () => void
}

/**
 * Right-side slide-in History panel — Phase 6, Milestone 6.2. Lists every
 * dataset stored in IndexedDB (newest first, per `listDatasets()`), lets
 * the consultant switch between them or delete one, and offers "New
 * dataset" to return to the upload flow.
 *
 * Triggered from the top bar's History button (see `TopBar.tsx`, Phase 7
 * Milestone 7.1) — this panel's own behavior is untouched by that
 * milestone; the left-sidebar shell is a later Phase 7 milestone's job.
 */
export function HistoryPanel({
  open,
  datasets,
  activeDatasetId,
  onClose,
  onSelect,
  onDelete,
  onNewDataset,
}: HistoryPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  useEffect(() => {
    if (open) panelRef.current?.focus()
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-slate-900/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Dataset history"
        tabIndex={-1}
        className="absolute top-0 right-0 flex h-full w-full max-w-sm flex-col gap-4 overflow-y-auto border-l border-slate-200 bg-white p-4 shadow-xl outline-none sm:p-6 dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            History
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close history"
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            &times;
          </button>
        </div>

        <button
          type="button"
          onClick={onNewDataset}
          className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
        >
          New dataset
        </button>

        {datasets.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No datasets stored yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {datasets.map((dataset) => (
              <HistoryRow
                key={dataset.id}
                dataset={dataset}
                isActive={dataset.id === activeDatasetId}
                onSelect={() => onSelect(dataset.id)}
                onDelete={() => onDelete(dataset.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

interface HistoryRowProps {
  dataset: PersistedDatasetSummary
  isActive: boolean
  onSelect: () => void
  onDelete: () => void
}

function HistoryRow({ dataset, isActive, onSelect, onDelete }: HistoryRowProps) {
  return (
    <li
      className={`flex items-center gap-2 rounded-lg border p-3 ${
        isActive
          ? 'border-blue-400 bg-blue-50 dark:border-blue-700 dark:bg-blue-950/40'
          : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-current={isActive ? 'true' : undefined}
        className="min-w-0 flex-1 text-left"
      >
        <p
          className="truncate font-medium text-slate-900 dark:text-slate-100"
          title={dataset.fileName}
        >
          {dataset.fileName}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {formatTimestamp(dataset.uploadedAt)}
        </p>
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label={`Delete ${dataset.fileName}`}
        className="shrink-0 rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700 dark:border-slate-700 dark:text-slate-300 dark:hover:border-red-800 dark:hover:bg-red-950 dark:hover:text-red-300"
      >
        Delete
      </button>
    </li>
  )
}
