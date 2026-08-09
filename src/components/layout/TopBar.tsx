interface TopBarProps {
  /** Number of datasets currently stored — shown as a small badge on the History trigger. */
  historyCount?: number
  onOpenHistory?: () => void
  /**
   * Whether a dataset is currently active (`view.kind === 'active'` in
   * `useDatasetSession`). Per beyond-MVP.md's user path: "the History
   * button on the right side of the top bar becomes visible" once
   * processing completes — it stays hidden during the initial 'loading'
   * and 'upload' states.
   */
  hasActiveDataset?: boolean
}

/**
 * Clock-with-counter-clockwise-arrow icon for the History trigger, per
 * beyond-MVP.md's top-bar spec. A plain inline SVG rather than pulling in
 * an icon library for a single glyph.
 */
function HistoryIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
      <path d="M12 7v5l3 3" />
    </svg>
  )
}

/**
 * Application top bar: logo + title (logo only below the `sm` breakpoint),
 * a KPI-card region spanning the rest of the bar's width, and the History
 * trigger in the right corner.
 *
 * The KPI region is a structural placeholder for now — Milestone 8.3 is
 * what actually generates business KPIs (it needs the automated LLM
 * pipeline that doesn't exist yet), so this milestone only reserves the
 * space and shows a subtle "coming soon" hint while a dataset is active,
 * so 8.3 can drop real cards in without restructuring the bar.
 */
export function TopBar({ historyCount = 0, onOpenHistory, hasActiveDataset = false }: TopBarProps) {
  return (
    <header className="border-b border-slate-200 bg-slate-100/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex shrink-0 items-center gap-2.5">
          <img src="/favicon.svg" alt="Keyrus" className="h-8 w-8" />
          <h1 className="hidden text-lg font-semibold text-slate-900 sm:inline dark:text-slate-100">
            Keyrus Dataset Analyzer
          </h1>
        </div>

        {/* KPI-card region — reserved for Milestone 8.3's business KPIs. */}
        <div
          role="region"
          aria-label="Key business indicators"
          className="flex min-w-0 flex-1 items-center gap-3 overflow-x-auto"
        >
          {hasActiveDataset && (
            <p className="text-xs text-slate-400 italic dark:text-slate-500">
              KPIs will appear here once your data is analyzed.
            </p>
          )}
        </div>

        {hasActiveDataset && onOpenHistory && (
          <button
            type="button"
            onClick={onOpenHistory}
            className="flex shrink-0 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:border-slate-400 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-800"
          >
            <HistoryIcon />
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
