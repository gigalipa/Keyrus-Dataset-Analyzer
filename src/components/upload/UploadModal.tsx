import { useEffect, useRef } from 'react'
import type { UploadState } from '../../types/upload'
import { FileUploadPanel } from './FileUploadPanel'

interface UploadModalProps {
  state: UploadState
  selectFile: (file: File) => void
  reset: () => void
  /** Present only when there's a previously active dataset to fall back to (i.e. this was opened via "New dataset", not the true empty state). */
  onDismiss?: () => void
}

/**
 * Centered overlay presentation for `FileUploadPanel` — Phase 6, Milestone
 * 6.2. Per beyond-MVP.md, the upload flow "pops up" as a modal rather than
 * living inline in the page: shown on first load when no dataset is stored
 * yet, and again whenever "New dataset" is chosen from the History panel.
 *
 * A plain fixed-position overlay rather than `<dialog>`: this app has no
 * other native `<dialog>` usage to stay consistent with, and a styled div
 * gives simpler control over the backdrop + centering without needing to
 * fight `<dialog>`'s default UA styles. Focus moves to the panel on open and
 * Escape dismisses — but only when `onDismiss` is provided, i.e. there's
 * something to fall back to; in the true empty-state case (no dataset
 * exists anywhere yet) the modal is intentionally not dismissable, matching
 * beyond-MVP.md's "only pops up if there's no dataset in history."
 */
export function UploadModal({
  state,
  selectFile,
  reset,
  onDismiss,
}: UploadModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    panelRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!onDismiss) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onDismiss])

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onDismiss?.()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="upload-heading"
        tabIndex={-1}
        className="relative w-full max-w-xl outline-none"
      >
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Close"
            className="absolute -top-3 -right-3 flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-600 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            &times;
          </button>
        )}
        <FileUploadPanel state={state} selectFile={selectFile} reset={reset} />
      </div>
    </div>
  )
}
