/**
 * Shared locale-aware timestamp formatting — used anywhere an
 * `uploadedAt`/`Date.now()` millisecond timestamp needs a readable string
 * (the results Overview card, Milestone 6.2's History panel).
 */

/** Formats a millisecond timestamp as a locale-aware date + time string. */
export function formatTimestamp(timestampMs: number): string {
  return new Date(timestampMs).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}
