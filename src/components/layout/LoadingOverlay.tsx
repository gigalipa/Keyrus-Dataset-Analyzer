/**
 * Full-viewport loading overlay — Phase 7, Milestone 7.3.
 *
 * Per beyond-MVP.md's user path: while a dataset is loading (initial
 * IndexedDB hydration, or any future multi-stage pipeline — see Phase 8,
 * Milestone 8.2), "everything locks under a loading overlay with a spinner
 * and a text line". `statusText` is a plain string prop precisely so a later
 * milestone can drive different, changing status text through this same
 * component without any restructuring — this milestone only ever passes one
 * static line.
 *
 * Fixed + `inset-0` so it covers the whole shell (top bar, sidebar, and
 * center viewport alike), not just `<main>` — `App.tsx` renders this as a
 * sibling of `AppShell`, not nested inside its children. `z-50` matches
 * `Sidebar`'s mobile overlay so this always wins if both could ever be
 * visible (they can't in practice: the sidebar/top bar only render once a
 * dataset session exists to navigate).
 */
interface LoadingOverlayProps {
  /** Single status line shown under the spinner (e.g. "Loading your workspace…"). */
  statusText: string
}

export function LoadingOverlay({ statusText }: LoadingOverlayProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-slate-50/95 backdrop-blur-sm dark:bg-slate-900/95"
    >
      <span
        aria-hidden="true"
        className="h-10 w-10 animate-spin rounded-full border-4 border-slate-300 border-t-slate-900 dark:border-slate-700 dark:border-t-slate-100"
      />
      <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
        {statusText}
      </p>
    </div>
  )
}
