import { useCallback, useId, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent, KeyboardEvent } from 'react'
import {
  ACCEPTED_FILE_EXTENSIONS_ATTR,
  ACCEPTED_FILE_EXTENSIONS_LABEL,
} from '../../utils/fileValidation'

interface FileDropzoneProps {
  /** Called with the first file the user drops or selects. */
  onFileSelected: (file: File) => void
  /** Name of the currently selected file, if any, shown as a preview. */
  selectedFileName?: string | null
  /** Disables interaction, e.g. while a file is processing. */
  disabled?: boolean
}

/**
 * Drag-and-drop file upload zone with a click-to-browse fallback.
 * Highlights its border while a file is dragged over it and previews the
 * selected file name once chosen.
 */
export function FileDropzone({
  onFileSelected,
  selectedFileName = null,
  disabled = false,
}: FileDropzoneProps) {
  const [isDragActive, setIsDragActive] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const inputId = useId()

  const openFileBrowser = useCallback(() => {
    if (!disabled) inputRef.current?.click()
  }, [disabled])

  const handleDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      if (!disabled) setIsDragActive(true)
    },
    [disabled],
  )

  const handleDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragActive(false)
  }, [])

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      setIsDragActive(false)
      if (disabled) return
      const file = event.dataTransfer.files?.[0]
      if (file) onFileSelected(file)
    },
    [disabled, onFileSelected],
  )

  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (file) onFileSelected(file)
      // Allow re-selecting the same file name after a reset.
      event.target.value = ''
    },
    [onFileSelected],
  )

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        openFileBrowser()
      }
    },
    [openFileBrowser],
  )

  return (
    <div>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        aria-label="Upload dataset file. Drag and drop, or press Enter to browse."
        aria-describedby={`${inputId}-hint`}
        onClick={openFileBrowser}
        onKeyDown={handleKeyDown}
        onDragOver={handleDragOver}
        onDragEnter={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-10 text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 sm:py-14 ${
          disabled
            ? 'cursor-not-allowed border-slate-200 bg-slate-50 opacity-60 dark:border-slate-800 dark:bg-slate-900'
            : isDragActive
              ? 'cursor-pointer border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-950'
              : 'cursor-pointer border-slate-300 bg-white hover:border-blue-400 hover:bg-blue-50/50 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-blue-500 dark:hover:bg-blue-950/40'
        }`}
      >
        <svg
          aria-hidden="true"
          className="h-8 w-8 text-slate-400 dark:text-slate-500"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 8.25 12 3.75m0 0L7.5 8.25M12 3.75v12"
          />
        </svg>

        <p className="text-sm font-medium text-slate-700 sm:text-base dark:text-slate-300">
          Drag and drop your file here, or{' '}
          <span className="text-blue-600 underline underline-offset-2 dark:text-blue-400">
            browse
          </span>
        </p>
        <p
          id={`${inputId}-hint`}
          className="text-xs text-slate-500 dark:text-slate-400"
        >
          Accepted formats: {ACCEPTED_FILE_EXTENSIONS_LABEL}
        </p>

        {selectedFileName && (
          <p className="mt-2 max-w-full truncate rounded-md bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            Selected: {selectedFileName}
          </p>
        )}
      </div>

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={ACCEPTED_FILE_EXTENSIONS_ATTR}
        className="sr-only"
        disabled={disabled}
        onChange={handleInputChange}
        aria-hidden="true"
        tabIndex={-1}
      />
    </div>
  )
}
