/**
 * Storage-quota guard — Phase 6, Milestone 6.1.
 *
 * `navigator.storage.estimate()` is not available in every browser/context
 * (older Safari, some private-browsing modes, non-secure origins), so this
 * module feature-detects it and simply skips the check when unavailable —
 * IndexedDB writes then proceed as before, since we have no basis to block
 * them. When the API *is* available, it's used to fail predictably before a
 * write that looks likely to exceed remaining quota, rather than letting
 * IndexedDB throw a `QuotaExceededError` mid-transaction (or, worse,
 * partially commit a multi-object-store write).
 *
 * The threshold logic is intentionally simple, not a precise accounting of
 * IndexedDB's on-disk overhead (which varies by browser/engine): estimate
 * the byte size of the payload being written via a JSON-stringify proxy,
 * and refuse the write if it wouldn't comfortably fit in the remaining
 * quota (`estimate().quota - estimate().usage`), leaving a safety margin
 * for the browser's own bookkeeping overhead.
 */

/** Thrown when a write is refused because it looks likely to exceed the browser's storage quota. */
export class StorageQuotaError extends Error {
  readonly quotaBytes?: number
  readonly usageBytes?: number
  readonly estimatedWriteBytes: number

  constructor(
    message: string,
    details: { quotaBytes?: number; usageBytes?: number; estimatedWriteBytes: number },
  ) {
    super(message)
    this.name = 'StorageQuotaError'
    this.quotaBytes = details.quotaBytes
    this.usageBytes = details.usageBytes
    this.estimatedWriteBytes = details.estimatedWriteBytes
  }
}

/**
 * Safety margin left un-used relative to the browser-reported quota, since
 * `estimate()` is itself an estimate and other tabs/origins-sharing-a-group
 * may be writing concurrently. 15% mirrors common "leave headroom" guidance
 * for client-side storage quotas without being a precisely-derived number.
 */
const SAFETY_MARGIN_RATIO = 0.15

/** Rough byte size of a JSON-serializable value, used as the write-size estimate. */
export function estimateByteSize(value: unknown): number {
  // `Blob` gives an accurate UTF-8 byte count where available (browsers);
  // fall back to a UTF-16-code-unit-length approximation (close enough for
  // a threshold check) in environments without `Blob` (some test runners).
  const json = JSON.stringify(value) ?? ''
  if (typeof Blob !== 'undefined') {
    return new Blob([json]).size
  }
  return json.length
}

/**
 * Checks the write described by `payload` against `navigator.storage.estimate()`
 * and throws `StorageQuotaError` if it looks likely to exceed the remaining
 * quota. No-ops (resolves normally) when the Storage API isn't available, or
 * when the browser doesn't report a usable `quota` figure.
 */
export async function assertWriteFitsQuota(payload: unknown): Promise<void> {
  if (
    typeof navigator === 'undefined' ||
    !navigator.storage ||
    typeof navigator.storage.estimate !== 'function'
  ) {
    return
  }

  let estimate: StorageEstimate
  try {
    estimate = await navigator.storage.estimate()
  } catch {
    // Feature-detected but failed at call time (e.g. permissions) — don't
    // block the write over a diagnostic we can't obtain.
    return
  }

  const { quota, usage } = estimate
  if (typeof quota !== 'number' || typeof usage !== 'number') {
    return
  }

  const estimatedWriteBytes = estimateByteSize(payload)
  const remaining = quota - usage
  const requiredRemaining = estimatedWriteBytes / (1 - SAFETY_MARGIN_RATIO)

  if (remaining < requiredRemaining) {
    throw new StorageQuotaError(
      'Not enough storage space remains to save this dataset. Free up space (e.g. delete an older dataset from History) and try again.',
      { quotaBytes: quota, usageBytes: usage, estimatedWriteBytes },
    )
  }
}
