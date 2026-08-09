interface HeaderProps {
  /** Number of datasets currently stored — shown as a small badge on the History trigger. */
  historyCount?: number
  onOpenHistory?: () => void
}

/**
 * Application header displaying the product title and a short tagline.
 *
 * `onOpenHistory`, added in Phase 6 Milestone 6.2, is a deliberately minimal
 * trigger for the History panel — a plain button in the existing header,
 * not a redesign. The real top-bar (logo placement, KPI region, the
 * clock/counter-clockwise-arrow icon, unread badge styling) is Phase 7's
 * job; this just needs to be a real, working way to open the panel today.
 */
export function Header({ historyCount = 0, onOpenHistory }: HeaderProps) {
  return (
    <header className="border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
      <div className="mx-auto flex max-w-5xl items-start justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl dark:text-slate-100">
            Data Consultant App
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Upload a client dataset and get an honest, non-technical first
            read.
          </p>
        </div>

        {onOpenHistory && (
          <button
            type="button"
            onClick={onOpenHistory}
            className="flex shrink-0 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:border-slate-400 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-800"
          >
            History
            <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
              {historyCount}
            </span>
          </button>
        )}
      </div>
    </header>
  )
}
