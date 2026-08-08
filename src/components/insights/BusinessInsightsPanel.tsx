import { useEffect, useMemo, useState } from 'react'
import * as aq from 'arquero'
import { useLlmRequest } from '../../hooks/useLlmRequest'
import { buildAnalysisSummary } from '../../lib/llm/analysisSummary'
import { generateBusinessInsights } from '../../lib/llm/businessInsights'
import type { BusinessInsightsResult } from '../../lib/llm/businessInsights'
import type { InsightGroup, InsightItem } from '../../lib/llm/schema'

interface BusinessInsightsPanelProps {
  /** The Arquero table to analyze and generate business insights for. */
  table: aq.ColumnTable
  /** The originating file, used for file-size context in the analysis summary. */
  file: File
}

/**
 * Milestone 4.3 display component: generates and renders KPIs, insights,
 * and recommendations from the shared `InsightGroup` schema. KPIs render as
 * metric cards (pulling a numeric `value`/`unit` out of `metadata` when the
 * LLM provided one), insights and recommendations render as bulleted lists
 * under clear headings. A single tag-filter control spans all three groups
 * so filtering isn't reinvented per section.
 */
export function BusinessInsightsPanel({
  table,
  file,
}: BusinessInsightsPanelProps) {
  const { status, data, error, run } = useLlmRequest<BusinessInsightsResult>()
  const [selectedTag, setSelectedTag] = useState<string | null>(null)

  useEffect(() => {
    void run(async (signal) => {
      const summary = buildAnalysisSummary(table, file)
      return generateBusinessInsights(summary, { signal })
    })
    // Re-run only when the underlying table/file identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, file])

  const allTags = useMemo(() => collectAllTags(data), [data])
  // Derived rather than synced via an effect: if the selected tag no longer
  // exists (e.g. new data loaded), treat the filter as cleared without an
  // extra render pass.
  const effectiveSelectedTag =
    selectedTag && allTags.includes(selectedTag) ? selectedTag : null

  if (status === 'idle' || status === 'loading') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400"
      >
        Generating business insights...
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div
        role="alert"
        className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
      >
        Couldn't generate business insights:{' '}
        {error?.userMessage ?? 'Unknown error.'}
        <button
          type="button"
          onClick={() =>
            void run(async (signal) => {
              const summary = buildAnalysisSummary(table, file)
              return generateBusinessInsights(summary, { signal })
            })
          }
          className="ml-3 font-medium underline underline-offset-2"
        >
          Retry
        </button>
      </div>
    )
  }

  if (!data) return null

  return (
    <section
      aria-labelledby="business-insights-heading"
      className="flex flex-col gap-6"
    >
      <h2
        id="business-insights-heading"
        className="text-lg font-semibold text-slate-900 dark:text-slate-100"
      >
        Business insights
      </h2>

      {allTags.length > 0 && (
        <TagFilterBar
          tags={allTags}
          selectedTag={effectiveSelectedTag}
          onSelectTag={setSelectedTag}
        />
      )}

      <KpiSection group={data.kpis} selectedTag={effectiveSelectedTag} />
      <BulletSection group={data.insights} selectedTag={effectiveSelectedTag} />
      <BulletSection
        group={data.recommendations}
        selectedTag={effectiveSelectedTag}
      />
    </section>
  )
}

/** Collects the union of every tag across all three groups, sorted alphabetically. */
function collectAllTags(data: BusinessInsightsResult | null): string[] {
  if (!data) return []
  const tags = new Set<string>()
  for (const group of [data.kpis, data.insights, data.recommendations]) {
    for (const item of group.items) {
      for (const tag of item.tags) tags.add(tag)
    }
  }
  return Array.from(tags).sort((a, b) => a.localeCompare(b))
}

function itemMatchesTag(item: InsightItem, selectedTag: string | null) {
  return !selectedTag || item.tags.includes(selectedTag)
}

interface TagFilterBarProps {
  tags: string[]
  selectedTag: string | null
  onSelectTag: (tag: string | null) => void
}

/** Shared tag-filter control spanning KPIs, insights, and recommendations. */
function TagFilterBar({ tags, selectedTag, onSelectTag }: TagFilterBarProps) {
  return (
    <div
      role="group"
      aria-label="Filter insights by tag"
      className="flex flex-wrap items-center gap-2"
    >
      <span className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
        Filter by tag
      </span>
      <FilterChip
        label="All"
        isSelected={selectedTag === null}
        onClick={() => onSelectTag(null)}
      />
      {tags.map((tag) => (
        <FilterChip
          key={tag}
          label={tag}
          isSelected={selectedTag === tag}
          onClick={() => onSelectTag(tag)}
        />
      ))}
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

interface GroupSectionProps {
  group: InsightGroup
  selectedTag: string | null
}

/** KPIs render as a grid of metric cards. */
function KpiSection({ group, selectedTag }: GroupSectionProps) {
  const items = group.items.filter((item) => itemMatchesTag(item, selectedTag))

  return (
    <div>
      <h3 className="mb-2 text-base font-semibold text-slate-900 dark:text-slate-100">
        {group.label}
      </h3>
      {items.length === 0 ? (
        <EmptyAfterFilter />
      ) : (
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <KpiCard key={item.id} item={item} />
          ))}
        </dl>
      )}
    </div>
  )
}

function KpiCard({ item }: { item: InsightItem }) {
  const metricValue = extractMetricValue(item)

  return (
    <div className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
        {item.title}
      </dt>
      {metricValue ? (
        <dd className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          {metricValue}
        </dd>
      ) : null}
      <dd
        className={
          metricValue
            ? 'text-sm text-slate-600 dark:text-slate-400'
            : 'text-lg font-semibold text-slate-900 dark:text-slate-100'
        }
      >
        {item.description}
      </dd>
      <ItemTags item={item} />
    </div>
  )
}

/** Pulls a displayable `"<value> <unit>"` string out of `item.metadata`, if the LLM provided one. */
function extractMetricValue(item: InsightItem): string | null {
  const metadata = item.metadata
  if (!metadata) return null
  const value = metadata.value
  if (typeof value !== 'number' && typeof value !== 'string') return null
  const unit = typeof metadata.unit === 'string' ? metadata.unit : ''
  const formattedValue =
    typeof value === 'number' ? value.toLocaleString() : value
  return unit ? `${formattedValue} ${unit}` : `${formattedValue}`
}

/** Insights and recommendations render as bullet lists under a heading. */
function BulletSection({ group, selectedTag }: GroupSectionProps) {
  const items = group.items.filter((item) => itemMatchesTag(item, selectedTag))

  return (
    <div>
      <h3 className="mb-2 text-base font-semibold text-slate-900 dark:text-slate-100">
        {group.label}
      </h3>
      {items.length === 0 ? (
        <EmptyAfterFilter />
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <p className="font-medium text-slate-900 dark:text-slate-100">
                {item.title}
              </p>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                {item.description}
              </p>
              <ItemTags item={item} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ItemTags({ item }: { item: InsightItem }) {
  if (item.tags.length === 0 && !item.priority) return null
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {item.priority && (
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
          {item.priority}
        </span>
      )}
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

function EmptyAfterFilter() {
  return (
    <p className="text-sm text-slate-500 dark:text-slate-400">
      No items match the selected tag.
    </p>
  )
}
