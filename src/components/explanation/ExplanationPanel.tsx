import type { LlmOutputSlot } from '../../types/persistedDataset'
import { asSingleGroup } from '../../types/persistedDataset'
import { Skeleton } from '../shared/Skeleton'

interface ExplanationPanelProps {
  /** This dataset's `llmOutputs.explanation` slot — a single `InsightGroup` of `type: 'explanation'` (exactly one item) when `status === 'done'`. */
  slot: LlmOutputSlot
}

/**
 * Phase 9, Milestone 9.2 display component for the "Explanation" section.
 * Renders the single-item `InsightGroup` `generateExplanation` (Phase 8,
 * Milestone 8.1) already produces and the pipeline already persists to
 * `llmOutputs.explanation` — this component adds no new generation logic,
 * it only displays what's there. Per `docs/beyond-MVP.md`, this section is
 * "mostly text-based": the one item's `title` renders as a headline and its
 * `description` as flowing prose (not the card/list treatment the other
 * three LLM sections use), in a `max-w-prose` column so it reads like an
 * actual explanation rather than a dense report stretched edge-to-edge.
 *
 * Unlike `DataDictionaryPanel`/`BusinessInsightsPanel`/`ClientQuestionsPanel`,
 * this panel is *not* wrapped in `MainViewport`'s `KeptMounted` treatment.
 * Those three carry local UI state (tag filters, sort order) that a section
 * switch would otherwise wipe by unmounting; this panel has no local state
 * at all — it just reads `slot` and renders it — so a plain mount/unmount on
 * every section switch is behaviorally identical to keeping it mounted
 * (nothing to lose) and matches `MainViewport`'s existing rule that
 * stateless Phase 9/10 sections render with plain conditionals.
 */
export function ExplanationPanel({ slot }: ExplanationPanelProps) {
  const data = asSingleGroup(slot)
  const item = data?.items[0] ?? null

  return (
    <section
      aria-labelledby="explanation-heading"
      className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 dark:border-slate-800 dark:bg-slate-900"
    >
      <div>
        <h2
          id="explanation-heading"
          className="text-lg font-semibold text-slate-900 dark:text-slate-100"
        >
          Explanation
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          A plain-language explanation of what this dataset says about the
          business.
        </p>
      </div>

      {(slot.status === 'pending' || slot.status === 'running') && (
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
            <span>Generating your business explanation...</span>
          </div>
          <div className="flex max-w-prose flex-col gap-3">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      )}

      {slot.status === 'error' && (
        <div
          role="alert"
          className="flex flex-col gap-1 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
        >
          <span>
            {slot.errorMessage ??
              'Something went wrong generating the explanation.'}
          </span>
          <span className="text-xs text-red-700 dark:text-red-400">
            Use "Re-run analysis" (in the sidebar) to try again.
          </span>
        </div>
      )}

      {slot.status === 'done' && item && (
        <div className="flex max-w-prose flex-col gap-4">
          <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            {item.title}
          </h3>
          <ExplanationProse text={item.description} />
        </div>
      )}
    </section>
  )
}

/**
 * Renders the explanation's narrative as one or more `<p>` paragraphs. The
 * prompt (`explanation.ts`'s `TASK_INSTRUCTIONS`) asks for "several
 * sentences to a few short paragraphs" but doesn't mandate a specific
 * separator, so this splits on blank lines (the natural paragraph break the
 * model tends to use) when present, and falls back to rendering the whole
 * string as a single paragraph when it isn't — either way, real prose
 * renders, never a bulleted/card layout.
 */
function ExplanationProse({ text }: { text: string }) {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0)

  const toRender = paragraphs.length > 0 ? paragraphs : [text]

  return (
    <div className="flex flex-col gap-4 text-base leading-relaxed text-slate-700 dark:text-slate-300">
      {toRender.map((paragraph, index) => (
        <p key={index} className="whitespace-pre-line">
          {paragraph}
        </p>
      ))}
    </div>
  )
}
