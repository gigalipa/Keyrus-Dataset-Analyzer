import { useEffect, useMemo, useRef, useState } from 'react'
import { generateDataDictionary } from '../../lib/llm/dataDictionary'
import { useLlmRequest } from '../../hooks/useLlmRequest'
import type { StructuralAnalysis } from '../../lib/analysis/structural'
import type { InsightGroup, InsightItem } from '../../lib/llm/schema'
import { SkeletonCardGrid } from '../shared/Skeleton'

interface DataDictionaryPanelProps {
  /** Phase 3's structural analysis (`analyzeStructure`) for the uploaded dataset. */
  analysis: StructuralAnalysis
  /** Optional dataset/file name, passed through to the prompt for context. */
  datasetName?: string
  /**
   * A dictionary already generated for this dataset in a previous session or
   * before a dataset switch (`PersistedDataset.llmOutputs.dataDictionary`,
   * via `useDatasetSession`). When present, this panel seeds itself from it
   * instead of calling the LLM again — see the Phase 7 bug-fix note on the
   * auto-trigger effect below.
   */
  persistedDictionary?: InsightGroup | null
  /**
   * Fired once, right after a *fresh* generation (not a seed) succeeds, so
   * the caller can persist it for next time. Deliberately separate from
   * `onDataChange`, which also fires for seeded data.
   */
  onGenerated?: (data: InsightGroup) => void
  /**
   * Notified whenever this panel's generated dictionary changes, so
   * `ResultsView` can include it in the Milestone 5.3 downloadable Markdown
   * report without this panel needing to know anything about reports.
   */
  onDataChange?: (data: InsightGroup | null) => void
}

/**
 * Phase 4, Milestone 4.2 display component: triggers `generateDataDictionary`
 * (Mistral) via the shared `useLlmRequest` loading-state hook and renders the
 * resulting `InsightGroup` — one card per column with its name, LLM-generated
 * description, data type, and example values — plus tag-based filter chips
 * (data type and data-quality-concern facets populated by
 * `dataDictionary.ts`). Renders generically from the shared schema, not a
 * bespoke shape, so it stays compatible with whatever tags/metadata a future
 * prompt revision adds.
 *
 * Phase 5, Part 3: per the product decision that the data dictionary (unlike
 * business insights / client questions) should generate automatically once
 * analysis completes, this fires `generate` itself in an effect the first
 * time it receives a real `analysis` (and again if `analysis` changes to a
 * new dataset), rather than waiting for a user click. The button stays as a
 * manual "Regenerate" affordance for a fresh take after the auto-run.
 */
export function DataDictionaryPanel({
  analysis,
  datasetName,
  persistedDictionary,
  onGenerated,
  onDataChange,
}: DataDictionaryPanelProps) {
  const { status, data, error, run, seed } = useLlmRequest<InsightGroup>()
  const [activeTag, setActiveTag] = useState<string | null>(null)

  const columnCount = analysis.columns.length

  // Marked `true` only while a fresh `run(...)` is in flight/just resolved,
  // so the `onGenerated` effect below can tell "just generated for real"
  // apart from "just seeded from a persisted result" — both land on
  // `status === 'success'`, but only the former should be persisted again.
  const generatingRef = useRef(false)

  const generate = () => {
    setActiveTag(null)
    generatingRef.current = true
    void run((signal) =>
      generateDataDictionary({ analysis, datasetName, signal }),
    )
  }

  // Once per distinct `analysis` (new dataset — this component is also
  // `key`ed by dataset id at the call site, so "new dataset" and "new mount"
  // coincide): seed from an already-generated result if one was persisted
  // for this dataset, otherwise auto-trigger generation. Guarded by a ref
  // (rather than relying on `status`) so this doesn't re-fire on every
  // render and doesn't fight with a manual "Regenerate" click's own `run`
  // call.
  //
  // Bug fix (Phase 7 live testing): this used to unconditionally call
  // `generate()` on every mount, which — combined with `useDatasetSession`
  // building a brand-new `AnalysisResult` object on every dataset switch —
  // meant switching between two already-analyzed datasets silently
  // re-ran the LLM call every time, burning API calls for no reason and
  // discarding the previous result. `persistedDictionary` (sourced from
  // `PersistedDataset.llmOutputs.dataDictionary`) is what actually survives
  // a switch/reload, so it — not local component state — is the source of
  // truth for "has this dataset already been documented".
  const autoTriggeredForRef = useRef<StructuralAnalysis | null>(null)
  useEffect(() => {
    if (columnCount === 0) return
    if (autoTriggeredForRef.current === analysis) return
    autoTriggeredForRef.current = analysis
    setActiveTag(null)

    if (persistedDictionary) {
      seed(persistedDictionary)
      return
    }

    generatingRef.current = true
    void run((signal) =>
      generateDataDictionary({ analysis, datasetName, signal }),
    )
    // Re-run only when the underlying analysis object identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis, columnCount, persistedDictionary])

  // Notify the parent (for the downloadable report) from the hook's own
  // reactive `status`/`data` rather than a `run(...).then(...)` chain — the
  // promise `run` returns resolves to `null` for a superseded/aborted
  // request too, which would incorrectly report "no dictionary" over a
  // still-valid in-flight regeneration. `status === 'success'` is only ever
  // true for the current, non-stale request (guarded inside `useLlmRequest`
  // via its own request-id check), so this can't fire out of order — true
  // whether the success came from a real generation or a seed.
  useEffect(() => {
    if (status !== 'success') return
    onDataChange?.(data)
    if (generatingRef.current && data) {
      generatingRef.current = false
      onGenerated?.(data)
    }
  }, [status, data, onDataChange, onGenerated])

  const allTags = useMemo(() => collectSortedTags(data?.items ?? []), [data])

  const visibleItems = useMemo(() => {
    const items = data?.items ?? []
    if (!activeTag) return items
    return items.filter((item) => item.tags.includes(activeTag))
  }, [data, activeTag])

  const toggleTag = (tag: string) => {
    setActiveTag((current) => (current === tag ? null : tag))
  }

  return (
    <section
      aria-labelledby="data-dictionary-heading"
      className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2
            id="data-dictionary-heading"
            className="text-lg font-semibold text-slate-900 dark:text-slate-100"
          >
            Data dictionary
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Plain-language explanations of what each of the {columnCount} column
            {columnCount === 1 ? '' : 's'} means.
          </p>
        </div>

        {status !== 'loading' && columnCount > 0 && (
          <button
            type="button"
            onClick={generate}
            className="shrink-0 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 dark:disabled:bg-slate-700"
          >
            {status === 'success' ? 'Regenerate' : 'Generate data dictionary'}
          </button>
        )}
      </div>

      {columnCount === 0 && (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No columns available to document.
        </p>
      )}

      {status === 'loading' && (
        <div className="flex flex-col gap-4">
          <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300"
          >
            <span
              aria-hidden="true"
              className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
            />
            <span>Generating insights...</span>
          </div>
          <SkeletonCardGrid count={Math.min(Math.max(columnCount, 3), 9)} />
        </div>
      )}

      {status === 'error' && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
        >
          <span>
            {error?.userMessage ??
              'Something went wrong generating the data dictionary.'}
          </span>
          <button
            type="button"
            onClick={generate}
            className="shrink-0 rounded-md border border-red-300 px-2.5 py-1 text-xs font-medium text-red-800 hover:bg-red-100 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900"
          >
            Retry
          </button>
        </div>
      )}

      {status === 'success' && data && (
        <div className="flex flex-col gap-4">
          {allTags.length > 0 && (
            <div
              role="group"
              aria-label="Filter columns by tag"
              className="flex flex-wrap gap-2"
            >
              {allTags.map((tag) => {
                const isActive = tag === activeTag
                return (
                  <button
                    key={tag}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => toggleTag(tag)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      isActive
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                    }`}
                  >
                    {tag}
                  </button>
                )
              })}
            </div>
          )}

          <p className="text-xs text-slate-500 dark:text-slate-400">
            Showing {visibleItems.length} of {data.items.length} column
            {data.items.length === 1 ? '' : 's'}
            {activeTag ? ` tagged "${activeTag}"` : ''}.
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleItems.map((item) => (
              <DictionaryEntryCard key={item.id} item={item} />
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

function DictionaryEntryCard({ item }: { item: InsightItem }) {
  const columnName =
    typeof item.metadata?.columnName === 'string'
      ? item.metadata.columnName
      : item.title
  const dataType =
    typeof item.metadata?.dataType === 'string' ? item.metadata.dataType : null
  const sampleValues = Array.isArray(item.metadata?.sampleValues)
    ? (item.metadata.sampleValues as unknown[])
    : []

  return (
    <article className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/40">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-mono text-sm font-semibold break-words text-slate-900 dark:text-slate-100">
          {columnName}
        </h3>
        {dataType && (
          <span className="shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-300">
            {dataType}
          </span>
        )}
      </div>

      <p className="text-sm text-slate-700 dark:text-slate-300">
        {item.description}
      </p>

      {sampleValues.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {sampleValues.map((value, index) => (
            <span
              key={index}
              className="rounded bg-white px-1.5 py-0.5 font-mono text-xs text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:ring-slate-700"
            >
              {String(value)}
            </span>
          ))}
        </div>
      )}

      {item.tags.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {item.tags.map((tag) => (
            <span
              key={tag}
              className="rounded bg-blue-50 px-1.5 py-0.5 text-[11px] text-blue-700 dark:bg-blue-950 dark:text-blue-300"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </article>
  )
}

/** Unique tags across all items, sorted for stable chip ordering. */
function collectSortedTags(items: InsightItem[]): string[] {
  const tags = new Set<string>()
  for (const item of items) {
    for (const tag of item.tags) tags.add(tag)
  }
  return Array.from(tags).sort((a, b) => a.localeCompare(b))
}
