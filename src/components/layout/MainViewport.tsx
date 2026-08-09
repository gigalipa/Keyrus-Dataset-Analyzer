import { lazy, Suspense, type ReactNode } from 'react'
import type { AnalysisResult } from '../../types/upload'
import type { LlmOutputSlot, PersistedDataset } from '../../types/persistedDataset'
import { asSingleGroup, asBusinessInsights } from '../../types/persistedDataset'
import { DataOverviewCard } from '../results/DataOverviewCard'
import { DataQualitySummaryCard } from '../results/DataQualitySummaryCard'
import { ColumnDetailView } from '../results/ColumnDetailView'
import type { InsightItem } from '../../lib/llm/schema'
import {
  buildMarkdownReport,
  downloadMarkdown,
  reportFileName,
  type ReportLlmContent,
} from '../../lib/report/markdownReport'
import { SkeletonCardGrid, SkeletonList } from '../shared/Skeleton'
import type { AppSection } from './sections'

/**
 * Lazy-loaded rather than statically imported, carried over unchanged from
 * `ResultsView` (Phase 5, Milestone 5.3 note): these three panels pull in
 * the LLM call plumbing, and `ClientQuestionsPanel` in particular pulls in
 * the `@google/genai` SDK, none of which are needed until their section is
 * actually opened.
 */
const DataDictionaryPanel = lazy(() =>
  import('../dictionary/DataDictionaryPanel').then((m) => ({
    default: m.DataDictionaryPanel,
  })),
)
const BusinessInsightsPanel = lazy(() =>
  import('../insights/BusinessInsightsPanel').then((m) => ({
    default: m.BusinessInsightsPanel,
  })),
)
const ClientQuestionsPanel = lazy(() =>
  import('../questions/ClientQuestionsPanel').then((m) => ({
    default: m.ClientQuestionsPanel,
  })),
)

interface MainViewportProps {
  activeSection: AppSection
  /** Stable identity of the currently active dataset — used to `key` the per-dataset LLM panels below (see their doc comment) and to persist newly-generated output back to the right record. */
  datasetId: string
  analysis: AnalysisResult
  file: File
  /** The active dataset's persisted LLM outputs — the pipeline (`useDatasetSession`, Phase 8) drives these; this component just passes each slot straight through to its display panel and reads from them for the downloadable report. */
  llmOutputs: PersistedDataset['llmOutputs']
}

/** Narrows the `clientQuestions` slot's `InsightGroup` down to the bare `InsightItem[]` `markdownReport.ts` expects. */
function asQuestionItems(slot: LlmOutputSlot): InsightItem[] | null {
  const group = asSingleGroup(slot)
  return group ? group.items : null
}

interface KeptMountedProps {
  active: boolean
  children: ReactNode
}

/**
 * Keeps `children` mounted at all times, only toggling visibility via a
 * `hidden` class. Used for the five sections whose content components carry
 * state across a section switch (most notably `DataDictionaryPanel`'s
 * auto-triggered LLM call on mount, and `BusinessInsightsPanel` /
 * `ClientQuestionsPanel`'s manually-generated local state) — conditionally
 * rendering (mounting/unmounting) them based on `activeSection` would
 * re-trigger the dictionary's LLM call on every visit and silently wipe out
 * already-generated insights/questions, a real regression from the old
 * always-mounted `ResultsView` this replaces (see Milestone 7.3 notes).
 */
function KeptMounted({ active, children }: KeptMountedProps) {
  return (
    <div className={active ? 'flex flex-col gap-6' : 'hidden'}>
      {children}
    </div>
  )
}

/** Honest "not built yet" placeholder for sections whose real content lands in a later phase. */
function ComingSoonCard({ label, phase }: { label: string; phase: number }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        <span className="font-semibold text-slate-900 dark:text-slate-100">
          {label}
        </span>{' '}
        — coming in Phase {phase}
      </p>
    </div>
  )
}

/**
 * Center viewport — Phase 7, Milestone 7.3. Renders the section
 * `Sidebar`/`sections.ts` says is active, replacing Milestone 7.2's
 * placeholder. Supersedes `ResultsView`'s scroll-spy/sticky-tab-bar model:
 * the sidebar already handles section switching, so this component only
 * needs to show/hide content, not scroll to it.
 *
 * The five sections with real Phase 3/4 content (`overview`, `quality`,
 * `dictionary`, `insights`, `questions`) are all mounted unconditionally and
 * toggled via `KeptMounted` — see its doc comment for why. The three
 * Phase 9/10 sections (`dashboard`, `explanation`, `datasets`) hold no state
 * and can mount/unmount freely with plain conditional rendering.
 *
 * The "Download report" button reads straight from the `llmOutputs` prop
 * (Phase 8, Milestone 8.1 — previously this component lifted local
 * `dictionaryData`/`insightsData`/`questionsData` state fed by each panel's
 * `onDataChange` callback just for this; now that `llmOutputs` already
 * carries everything generated for this dataset, that indirection is gone).
 *
 * `key={datasetId}` on the three LLM panels (bug fix, found in live Phase 7
 * testing): `KeptMounted` intentionally keeps them mounted across *section*
 * switches so their local UI state (tag filters, etc.) survives navigation,
 * but without a key tied to the dataset, switching *datasets* would leave
 * stale per-dataset UI state (e.g. a tag filter referencing the old
 * dataset's tags) hanging around. Keying by `datasetId` makes React remount
 * these three (only) when the active dataset actually changes. Left in place
 * even though these panels no longer own any async LLM state themselves
 * (Phase 8 made them pure display components) — still harmless, still
 * correct defense-in-depth.
 */
export function MainViewport({
  activeSection,
  datasetId,
  analysis,
  file,
  llmOutputs,
}: MainViewportProps) {
  const handleDownloadReport = () => {
    const reportContent: ReportLlmContent = {
      dictionary: asSingleGroup(llmOutputs.dataDictionary),
      businessInsights: asBusinessInsights(llmOutputs.businessInsights),
      clientQuestions: asQuestionItems(llmOutputs.clientQuestions),
    }
    const report = buildMarkdownReport(analysis, file, reportContent)
    downloadMarkdown(reportFileName(file.name), report)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="sr-only">Analysis results</h2>
        <button
          type="button"
          onClick={handleDownloadReport}
          className="self-start rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:border-slate-400 hover:bg-slate-50 sm:self-auto dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-800"
        >
          Download report (Markdown)
        </button>
      </div>

      <KeptMounted active={activeSection === 'overview'}>
        <DataOverviewCard
          fileName={file.name}
          rowCount={analysis.structural.stats.totalRows}
          columnCount={analysis.structural.stats.totalColumns}
          fileSizeMB={analysis.structural.stats.fileSizeMB}
          uploadedAt={analysis.uploadedAt}
        />
        <ColumnDetailView
          structural={analysis.structural}
          numeric={analysis.numeric}
          dates={analysis.dates}
          quality={analysis.quality}
        />
      </KeptMounted>

      <KeptMounted active={activeSection === 'quality'}>
        <DataQualitySummaryCard
          quality={analysis.quality}
          numeric={analysis.numeric}
          totalRows={analysis.structural.stats.totalRows}
        />
      </KeptMounted>

      <KeptMounted active={activeSection === 'dictionary'}>
        <Suspense fallback={<SkeletonCardGrid count={3} />}>
          <DataDictionaryPanel
            key={datasetId}
            slot={llmOutputs.dataDictionary}
            columnCount={analysis.structural.columns.length}
          />
        </Suspense>
      </KeptMounted>

      <KeptMounted active={activeSection === 'insights'}>
        <Suspense fallback={<SkeletonCardGrid count={3} />}>
          <BusinessInsightsPanel key={datasetId} slot={llmOutputs.businessInsights} />
        </Suspense>
      </KeptMounted>

      <KeptMounted active={activeSection === 'questions'}>
        <Suspense fallback={<SkeletonList count={2} />}>
          <ClientQuestionsPanel key={datasetId} slot={llmOutputs.clientQuestions} />
        </Suspense>
      </KeptMounted>

      {activeSection === 'dashboard' && (
        <ComingSoonCard label="Dashboard" phase={9} />
      )}
      {activeSection === 'explanation' && (
        <ComingSoonCard label="Explanation" phase={9} />
      )}
      {activeSection === 'datasets' && (
        <ComingSoonCard label="Datasets" phase={10} />
      )}
    </div>
  )
}
