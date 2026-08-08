/**
 * Shared types for the file upload feature.
 */

/** Lifecycle states for a file upload attempt. */
export type UploadStatus = 'idle' | 'processing' | 'success' | 'error'

/** Snapshot of the upload state machine at a point in time. */
export interface UploadState {
  status: UploadStatus
  file: File | null
  errorMessage: string | null
}
