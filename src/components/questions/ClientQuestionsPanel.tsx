import { useEffect, useMemo, useState } from 'react'
import type { DataQualityReport } from '../../lib/analysis/quality'
import type { ColumnMetadata } from '../../lib/analysis/structural'
import { generateClientQuestions } from '../../lib/llm/clientQuestions'
import type { InsightItem } from '../../lib/llm/schema'
import { useLlmRequest } from '../../hooks/useLlmRequest'

interface ClientQuestionsPanelProps {
  columns: ColumnMetadata[]
  qualityReport: DataQualityReport
}

/** How long the "Copied!" confirmation stays visible after a successful copy. */
const COPY_CONFIRMATION_MS = 2000

/**
 * Milestone 4.4 display component: renders the `InsightGroup` of `type:
 * 'question'` items produced by `generateClientQuestions` as a numbered
 * list, with topic-tag filter chips above it and a per-question
 * copy-to-clipboard button. Owns its own `useLlmRequest` lifecycle — idle
 * shows a "Generate" trigger, loading shows a spinner, error shows a retry
 * button, success renders the list.
 */
export function ClientQuestionsPanel({
  columns,
  qualityReport,
}: ClientQuestionsPanelProps) {
  const { status, data, error, run } =
    useLlmRequest<Awaited<ReturnType<typeof generateClientQuestions>>>()
  const [activeTopic, setActiveTopic] = useState<string | null>(null)

  const handleGenerate = () => {
    run((signal) => generateClientQuestions(columns, qualityReport, signal))
  }

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
        {status !== 'loading' && (
          <button
            type="button"
            onClick={handleGenerate}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
          >
            {status === 'success' ? 'Regenerate' : 'Generate questions'}
          </button>
        )}
      </div>

      {status === 'loading' && (
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
      )}

      {status === 'error' && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
        >
          <span>{error?.userMessage ?? 'Something went wrong.'}</span>
          <button
            type="button"
            onClick={handleGenerate}
            className="shrink-0 rounded-md border border-current px-2 py-1 text-xs font-medium"
          >
            Retry
          </button>
        </div>
      )}

      {status === 'idle' && (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Generate a set of strategic questions to ask the client about this
          dataset.
        </p>
      )}

      {status === 'success' && data && (
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
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timeoutId = window.setTimeout(
      () => setCopied(false),
      COPY_CONFIRMATION_MS,
    )
    return () => window.clearTimeout(timeoutId)
  }, [copied])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(
        `${item.title}\n\n${item.description}`,
      )
      setCopied(true)
    } catch {
      // Clipboard access denied/unavailable — silently no-op, the button
      // simply won't show the "Copied!" confirmation.
    }
  }

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
      <button
        type="button"
        onClick={handleCopy}
        aria-label={`Copy question: ${item.title}`}
        className="shrink-0 rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:border-slate-400 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600"
      >
        {copied ? 'Copied!' : 'Copy'}
      </button>
    </li>
  )
}
