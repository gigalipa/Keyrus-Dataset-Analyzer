import type { UploadStatus } from '../../types/upload'

interface UploadStatusBannerProps {
  status: UploadStatus
  fileName: string | null
  errorMessage: string | null
}

const STATUS_STYLES: Record<UploadStatus, string> = {
  idle: 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
  processing:
    'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300',
  success:
    'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300',
  error:
    'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300',
}

/**
 * Renders the current upload status: "Ready to upload", "Processing...",
 * "Upload complete", or "Error: [message]".
 */
export function UploadStatusBanner({
  status,
  fileName,
  errorMessage,
}: UploadStatusBannerProps) {
  const message = getStatusMessage(status, fileName, errorMessage)

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center gap-2 rounded-md border px-4 py-3 text-sm font-medium ${STATUS_STYLES[status]}`}
    >
      {status === 'processing' && (
        <span
          aria-hidden="true"
          className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      <span>{message}</span>
    </div>
  )
}

function getStatusMessage(
  status: UploadStatus,
  fileName: string | null,
  errorMessage: string | null,
): string {
  switch (status) {
    case 'idle':
      return 'Ready to upload'
    case 'processing':
      return 'Processing...'
    case 'success':
      return `Upload complete${fileName ? `: ${fileName}` : ''}`
    case 'error':
      return `Error: ${errorMessage ?? 'Something went wrong.'}`
  }
}
