import { useMemo, useState } from 'react'
import type { LlmOutputSlot } from '../../types/persistedDataset'
import type { InsightGroup, InsightItem } from '../../lib/llm/schema'
import { SkeletonList } from '../shared/Skeleton'
import { CopyButton } from '../shared/CopyButton'

interface ClientQuestionsPanelProps {
  /** This dataset's `llmOutputs.clientQuestions` slot — a single `InsightGroup` of `type: 'question'` items when `status === 'done'`. */
  slot: LlmOutputSlot
}

/**
 * Milestone 4.4 display component; rewritten Phase 8, Milestone 8.1 into a
 * pure display component. Renders the `InsightGroup` of `type: 'question'`
 * items produced by the pipeline's client-questions step as a numbered list,
 * with topic-tag filter chips above it and a per-question
 * copy-to-clipboard button.
 *
 * No longer owns any `useLlmRequest`/trigger logic — the pipeline generates
 * this automatically; this component only ever renders `slot`.
 */
export function ClientQuestionsPanel({ slot }: ClientQuestionsPanelProps) {
  const [activeTopic, setActiveTopic] = useState<string | null>(null)

  const data: InsightGroup | null =
    slot.status === 'done' && slot.data && !Array.isArray(slot.data) ? slot.data : null

  const allTopics = useMemo(() => {
    if (!data) return []
    const topics = new Set<string>()
    for (const item of data.items) {
      for (const tag of item.tags) topics.add(tag)
    }
    return Array.from(topics).sort()
  }, [data])

  const visibleItems = useMemo(() => {
    if (!data) return []
    if (!activeTopic) return data.items
    return data.items.filter((item) => item.tags.includes(activeTopic))
  }, [data, activeTopic])

  return (
    <section
      aria-label="Client questions"
      className="flex flex-col gap-4 rounded-lg border border-slate-200 p-4 dark:border-slate-800"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Client Questions
        </h2>
      </div>

      {(slot.status === 'pending' || slot.status === 'running') && (
        <div className="flex flex-col gap-3">
          <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300"
          >
            <span
              aria-hidden="true"
              className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
            />
            <span>Generating questions...</span>
          </div>
          <SkeletonList count={4} />
        </div>
      )}

      {slot.status === 'error' && (
        <div
          role="alert"
          className="flex flex-col gap-1 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
        >
          <span>{slot.errorMessage ?? 'Something went wrong.'}</span>
          <span className="text-xs text-red-700 dark:text-red-400">
            Use "Re-run analysis" (in the sidebar) to try again.
          </span>
        </div>
      )}

      {slot.status === 'done' && data && (
        <>
          {allTopics.length > 0 && (
            <div
              role="group"
              aria-label="Filter by topic"
              className="flex flex-wrap gap-2"
            >
              <TopicChip
                label="All"
                isActive={activeTopic === null}
                onClick={() => setActiveTopic(null)}
              />
              {allTopics.map((topic) => (
                <TopicChip
                  key={topic}
                  label={topic}
                  isActive={activeTopic === topic}
                  onClick={() =>
                    setActiveTopic((current) =>
                      current === topic ? null : topic,
                    )
                  }
                />
              ))}
            </div>
          )}

          {visibleItems.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No questions match this topic.
            </p>
          ) : (
            <ol className="flex flex-col gap-3">
              {visibleItems.map((item, index) => (
                <QuestionListItem key={item.id} item={item} index={index} />
              ))}
            </ol>
          )}
        </>
      )}
    </section>
  )
}

interface TopicChipProps {
  label: string
  isActive: boolean
  onClick: () => void
}

function TopicChip({ label, isActive, onClick }: TopicChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      className={`rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors ${
        isActive
          ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900'
          : 'border-slate-300 text-slate-600 hover:border-slate-400 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600'
      }`}
    >
      {label}
    </button>
  )
}

interface QuestionListItemProps {
  item: InsightItem
  index: number
}

function QuestionListItem({ item, index }: QuestionListItemProps) {
  return (
    <li className="flex items-start gap-3 rounded-md border border-slate-200 p-3 dark:border-slate-800">
      <span
        aria-hidden="true"
        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300"
      >
        {index + 1}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="font-medium text-slate-900 dark:text-slate-100">
          {item.title}
        </p>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {item.description}
        </p>
        {item.tags.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {item.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600 capitalize dark:bg-slate-800 dark:text-slate-300"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
      <CopyButton
        text={`${item.title}\n\n${item.description}`}
        label={`Copy question: ${item.title}`}
      />
    </li>
  )
}
