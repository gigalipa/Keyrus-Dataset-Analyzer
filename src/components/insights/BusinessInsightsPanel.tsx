import { useMemo, useState } from 'react'
import type { LlmOutputSlot } from '../../types/persistedDataset'
import { asBusinessInsights } from '../../types/persistedDataset'
import type { InsightGroup, InsightItem, InsightPriority } from '../../lib/llm/schema'
import { SkeletonCardGrid, SkeletonList } from '../shared/Skeleton'
import { CopyButton } from '../shared/CopyButton'

interface BusinessInsightsPanelProps {
  /**
   * This dataset's `llmOutputs.businessInsights` slot. Its `data`, when
   * `status === 'done'`, is a 3-element `InsightGroup[]` positionally
   * ordered `[kpis, insights, recommendations]` — the shape
   * `src/lib/pipeline/runPipeline.ts` stores it in — reconstructed here back
   * into the friendlier `BusinessInsightsResult` shape for rendering.
   */
  slot: LlmOutputSlot
}

/**
 * Milestone 4.3 display component; rewritten Phase 8, Milestone 8.1 into a
 * pure display component; reworked again Phase 9, Milestone 9.3 per
 * beyond-MVP.md's "Business Insight cards" spec and the "Filterable Card
 * List Checklist" (`docs/development-process.md`).
 *
 * KPIs no longer render here — they now live in the top bar's compact cards
 * (Phase 8, Milestone 8.3) and will live in Dashboard (Milestone 9.1). This
 * component only renders `insights` and `recommendations`, from the same
 * `businessInsights` slot the pipeline already produces (`asBusinessInsights`
 * still decodes all three groups; `data.kpis` is simply left unrendered).
 *
 * Design choice: insights and recommendations are kept as two separate,
 * independently filterable/sortable card sections (each its own
 * `InsightCardSection`) rather than merged into one list with a
 * type-facet tag. They're semantically distinct (an "insight" describes
 * what the data shows, a "recommendation" prescribes what to do about it)
 * and the underlying `InsightGroup`s already arrive as two groups with their
 * own labels/bounds — keeping them separate preserves that distinction
 * without inventing a synthetic "type" tag, while both sections reuse the
 * exact same `InsightCardSection` component so their filter/sort UX matches.
 *
 * No longer owns any `useLlmRequest`/trigger logic — the pipeline generates
 * this automatically; this component only ever renders `slot`.
 */
export function BusinessInsightsPanel({ slot }: BusinessInsightsPanelProps) {
  const data = useMemo(() => asBusinessInsights(slot), [slot])

  if (slot.status === 'pending' || slot.status === 'running') {
    return (
      <div className="flex flex-col gap-4">
        <div
          role="status"
          aria-live="polite"
          className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400"
        >
          Generating business insights...
        </div>
        <SkeletonCardGrid count={3} />
        <SkeletonList count={3} />
      </div>
    )
  }

  if (slot.status === 'error') {
    return (
      <div
        role="alert"
        className="flex flex-col gap-1 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
      >
        <span>
          Couldn't generate business insights:{' '}
          {slot.errorMessage ?? 'Unknown error.'}
        </span>
        <span className="text-xs text-red-700 dark:text-red-400">
          Use "Re-run analysis" (in the sidebar) to try again.
        </span>
      </div>
    )
  }

  if (!data) return null

  return (
    <section
      aria-labelledby="business-insights-heading"
      className="flex flex-col gap-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          id="business-insights-heading"
          className="text-lg font-semibold text-slate-900 dark:text-slate-100"
        >
          Business insights
        </h2>
      </div>

      <InsightCardSection group={data.insights} />
      <InsightCardSection group={data.recommendations} />
    </section>
  )
}

/** Ranks a priority high→low for sorting; missing priority sorts last (defensively — `businessInsights.ts` should always populate it). */
function priorityRank(priority: InsightPriority | undefined): number {
  switch (priority) {
    case 'high':
      return 3
    case 'medium':
      return 2
    case 'low':
      return 1
    default:
      return 0
  }
}

/** Derives the sorted, deduplicated set of tags actually present across `group`'s items. */
function collectTags(group: InsightGroup): string[] {
  const tags = new Set<string>()
  for (const item of group.items) {
    for (const tag of item.tags) tags.add(tag)
  }
  return Array.from(tags).sort((a, b) => a.localeCompare(b))
}

interface InsightCardSectionProps {
  group: InsightGroup
}

/**
 * One filterable, sortable card section — used for both `insights` and
 * `recommendations` so their filter/sort UX matches exactly. Owns its own
 * tag-filter and importance-sort state (per the checklist: state stays local
 * to *this* section, not shared globally across sections).
 *
 * Tag filtering is multi-select AND: an item must carry every selected tag
 * to remain visible. AND was chosen (over OR) because it's what makes the
 * "no items match" empty state reachable using only tags actually present
 * on real items (pick two tags that individually match different items but
 * never co-occur on the same one) — an OR filter built only from
 * present-tag options can never produce an empty result.
 */
function InsightCardSection({ group }: InsightCardSectionProps) {
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [sortByImportance, setSortByImportance] = useState(false)

  const availableTags = useMemo(() => collectTags(group), [group])
  // Derived rather than synced via an effect: if a selected tag no longer
  // exists (e.g. new data loaded), treat it as cleared without an extra
  // render pass.
  const effectiveSelectedTags = useMemo(
    () => selectedTags.filter((tag) => availableTags.includes(tag)),
    [selectedTags, availableTags],
  )

  const visibleItems = useMemo(() => {
    const filtered = group.items.filter((item) =>
      effectiveSelectedTags.every((tag) => item.tags.includes(tag)),
    )
    if (!sortByImportance) return filtered
    // `Array.prototype.sort` is spec-guaranteed stable (ES2019+), so items
    // of equal priority keep their original relative order.
    return [...filtered].sort(
      (a, b) => priorityRank(b.priority) - priorityRank(a.priority),
    )
  }, [group.items, effectiveSelectedTags, sortByImportance])

  function toggleTag(tag: string) {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    )
  }

  const sectionHeadingId = `${group.type}-heading`

  return (
    <div aria-labelledby={sectionHeadingId}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3
          id={sectionHeadingId}
          className="text-base font-semibold text-slate-900 dark:text-slate-100"
        >
          {group.label}
        </h3>
        {visibleItems.length > 0 && (
          <CopyButton
            text={visibleItems
              .map((item) => `${item.title}\n${item.description}`)
              .join('\n\n')}
            label={`Copy all ${group.label.toLowerCase()}`}
          />
        )}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        {availableTags.length > 0 && (
          <div
            role="group"
            aria-label={`Filter ${group.label.toLowerCase()} by tag`}
            className="flex flex-wrap items-center gap-2"
          >
            <span className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
              Filter by tag
            </span>
            {availableTags.map((tag) => (
              <FilterChip
                key={tag}
                label={tag}
                isSelected={effectiveSelectedTags.includes(tag)}
                onClick={() => toggleTag(tag)}
              />
            ))}
            {effectiveSelectedTags.length > 0 && (
              <FilterChip
                label="Clear"
                isSelected={false}
                onClick={() => setSelectedTags([])}
              />
            )}
          </div>
        )}

        <button
          type="button"
          aria-pressed={sortByImportance}
          onClick={() => setSortByImportance((prev) => !prev)}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
            sortByImportance
              ? 'border-blue-600 bg-blue-600 text-white dark:border-blue-500 dark:bg-blue-500'
              : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
          }`}
        >
          Sort by importance (high → low)
        </button>
      </div>

      {visibleItems.length === 0 ? (
        <EmptyAfterFilter />
      ) : (
        <ul className="flex flex-col gap-3">
          {visibleItems.map((item) => (
            <li
              key={item.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-900 dark:text-slate-100">
                  {item.title}
                </p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  {item.description}
                </p>
                <ItemTags item={item} />
              </div>
              <CopyButton
                text={`${item.title}\n\n${item.description}`}
                label={`Copy: ${item.title}`}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

interface FilterChipProps {
  label: string
  isSelected: boolean
  onClick: () => void
}

function FilterChip({ label, isSelected, onClick }: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isSelected}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        isSelected
          ? 'border-blue-600 bg-blue-600 text-white dark:border-blue-500 dark:bg-blue-500'
          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
      }`}
    >
      {label}
    </button>
  )
}

/** Importance badge — always shown (priority is now a required, normalized field), not just when present. */
function ItemTags({ item }: { item: InsightItem }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      <span
        className={`rounded-full px-2 py-0.5 text-xs font-medium ${priorityBadgeClasses(item.priority)}`}
      >
        {item.priority ?? 'medium'} importance
      </span>
      {item.tags.map((tag) => (
        <span
          key={tag}
          className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400"
        >
          {tag}
        </span>
      ))}
    </div>
  )
}

function priorityBadgeClasses(priority: InsightPriority | undefined): string {
  switch (priority) {
    case 'high':
      return 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
    case 'low':
      return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
    case 'medium':
    default:
      return 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
  }
}

function EmptyAfterFilter() {
  return (
    <p className="text-sm text-slate-500 dark:text-slate-400">
      No items match the selected tag filters.
    </p>
  )
}
