import type { PersistedDataset } from '../../types/persistedDataset'
import { asBusinessInsights } from '../../types/persistedDataset'
import type { InsightItem } from '../../lib/llm/schema'

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
  /**
   * The active dataset's persisted LLM outputs — Milestone 8.3 reads its
   * `businessInsights` slot's `kpis` group (decoded via the shared
   * `asBusinessInsights` helper, same convention `MainViewport`/
   * `BusinessInsightsPanel` use) to render compact KPI cards here.
   * `undefined` while no dataset is active.
   */
  llmOutputs?: PersistedDataset['llmOutputs']
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

/** Pulls a displayable `"<value> <unit>"` string out of `item.metadata`, if the LLM provided one — same convention as `BusinessInsightsPanel`'s `extractMetricValue`, kept small and local rather than shared for two call sites. */
function extractMetricValue(item: InsightItem): string | null {
  const metadata = item.metadata
  if (!metadata) return null
  const value = metadata.value
  if (typeof value !== 'number' && typeof value !== 'string') return null
  const unit = typeof metadata.unit === 'string' ? metadata.unit : ''
  const formattedValue = typeof value === 'number' ? value.toLocaleString() : value
  return unit ? `${formattedValue} ${unit}` : `${formattedValue}`
}

/**
 * One compact metric tile in the top bar — title plus either a numeric
 * value or, if the LLM couldn't derive one, a short qualitative
 * description. Fixed width with `line-clamp-2` (rather than single-line
 * `truncate`) on both the title and the description, so a longer KPI title
 * or description wraps onto up to two lines instead of being cut off —
 * paired with the taller top bar below.
 */
function TopBarKpiCard({ item }: { item: InsightItem }) {
  const metricValue = extractMetricValue(item)

  return (
    <div className="flex w-44 shrink-0 flex-col gap-0.5 rounded-md border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
      <dt className="line-clamp-2 text-[0.65rem] font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
        {item.title}
      </dt>
      <dd
        className={
          metricValue
            ? 'text-sm font-bold text-slate-900 dark:text-slate-100'
            : 'line-clamp-2 text-xs font-semibold text-slate-700 dark:text-slate-300'
        }
      >
        {metricValue ?? item.description}
      </dd>
    </div>
  )
}

/**
 * Application top bar: logo + title (logo only below the `sm` breakpoint)
 * pinned to the far left, a KPI-card region filling the space between, and
 * the History trigger pinned to the far right.
 *
 * Milestone 8.3: once the active dataset's `businessInsights` slot is
 * `'done'`, the reserved region renders its `kpis` group's items as compact
 * metric tiles. Before that (pending/running/error), it falls back to the
 * same "coming soon" hint Milestone 7.1 shipped — the full-viewport
 * `LoadingOverlay` (Milestone 8.2) already covers the "pipeline is running"
 * state, so this region doesn't need its own loading UI, and
 * `BusinessInsightsPanel` already owns the detailed error state, so this
 * region doesn't duplicate it either.
 *
 * UI fix (live-testing feedback): the bar no longer centers its content
 * inside a `max-w-7xl` column — logo and History now sit at the true left/
 * right edges of the viewport (full-bleed, just horizontal padding), giving
 * the KPI region the most possible width before it needs to horizontally
 * scroll. The bar is also taller (`py-3` -> `py-4`) so each KPI tile has
 * room for its title and up to two lines of wrapped text instead of a
 * single truncated line.
 */
export function TopBar({
  historyCount = 0,
  onOpenHistory,
  hasActiveDataset = false,
  llmOutputs,
}: TopBarProps) {
  const kpiItems =
    llmOutputs && asBusinessInsights(llmOutputs.businessInsights)?.kpis.items

  return (
    <header className="border-b border-slate-200 bg-slate-100/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
      <div className="flex items-center gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex shrink-0 items-center gap-2.5">
          <img src="/favicon.svg" alt="Keyrus" className="h-8 w-8" />
          <h1 className="hidden text-lg font-semibold text-slate-900 sm:inline dark:text-slate-100">
            Keyrus Dataset Analyzer
          </h1>
        </div>

        {/* KPI-card region — Milestone 8.3's business KPIs. */}
        <dl
          role="region"
          aria-label="Key business indicators"
          className="flex min-w-0 flex-1 items-center gap-3 overflow-x-auto"
        >
          {kpiItems && kpiItems.length > 0 ? (
            kpiItems.map((item) => <TopBarKpiCard key={item.id} item={item} />)
          ) : hasActiveDataset ? (
            <p className="text-xs text-slate-400 italic dark:text-slate-500">
              KPIs will appear here once your data is analyzed.
            </p>
          ) : null}
        </dl>

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
