import { lazy, Suspense, useState, type ReactNode } from 'react'
import type { AnalysisResult } from '../../types/upload'
import type { PersistedDataset } from '../../types/persistedDataset'
import { DataOverviewCard } from '../results/DataOverviewCard'
import { DataQualitySummaryCard } from '../results/DataQualitySummaryCard'
import { ColumnDetailView } from '../results/ColumnDetailView'
import type { InsightGroup, InsightItem } from '../../lib/llm/schema'
import type { BusinessInsightsResult } from '../../lib/llm/businessInsights'
import {
  buildMarkdownReport,
  downloadMarkdown,
  reportFileName,
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
  /** The active dataset's persisted LLM outputs, so panels can seed from an already-generated result instead of regenerating. */
  llmOutputs: PersistedDataset['llmOutputs']
  onDictionaryGenerated: (data: InsightGroup) => void
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
 * Also owns the lifted `dictionaryData`/`insightsData`/`questionsData` state
 * that used to live in `ResultsView` purely to feed the "Download report"
 * button — same panels, same `onDataChange` wiring, just hosted here instead
 * so the button stays reachable regardless of which section is active
 * (placed at the top of the viewport, always visible whenever a dataset is
 * active).
 *
 * `key={datasetId}` on the three LLM panels (bug fix, found in live Phase 7
 * testing): `KeptMounted` intentionally keeps them mounted across *section*
 * switches so generated content survives navigation, but without a key tied
 * to the dataset, that same "stay mounted" behavior applied across *dataset*
 * switches too — `BusinessInsightsPanel`/`ClientQuestionsPanel` would keep
 * showing one dataset's generated content after switching to a different
 * one, and `DataDictionaryPanel` would re-run its LLM call on every switch
 * because each switch builds a new `analysis` object. Keying by `datasetId`
 * makes React remount these three (only) when the active dataset actually
 * changes, giving each dataset a clean slate; the dictionary immediately
 * re-seeds itself from `persistedDictionary` rather than showing a blank
 * loading state.
 */
export function MainViewport({
  activeSection,
  datasetId,
  analysis,
  file,
  llmOutputs,
  onDictionaryGenerated,
}: MainViewportProps) {
  const [dictionaryData, setDictionaryData] = useState<InsightGroup | null>(
    null,
  )
  const [insightsData, setInsightsData] =
    useState<BusinessInsightsResult | null>(null)
  const [questionsData, setQuestionsData] = useState<InsightItem[] | null>(
    null,
  )

  // Only the data dictionary is persisted/rehydrated as of this fix (Phase
  // 8 will do the same for the other three slots as part of the automated
  // pipeline). `llmOutputs.dataDictionary.data` is typed `InsightGroup |
  // InsightGroup[] | null` at the storage layer since some slots (business
  // insights) hold multiple groups — the dictionary slot itself only ever
  // holds one, so this narrows defensively rather than assuming.
  const persistedDictionaryData = llmOutputs.dataDictionary
  const persistedDictionary =
    persistedDictionaryData.status === 'done' &&
    persistedDictionaryData.data &&
    !Array.isArray(persistedDictionaryData.data)
      ? persistedDictionaryData.data
      : null

  const handleDownloadReport = () => {
    const report = buildMarkdownReport(analysis, file, {
      dictionary: dictionaryData,
      businessInsights: insightsData,
      clientQuestions: questionsData,
    })
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
            analysis={analysis.structural}
            datasetName={file.name}
            persistedDictionary={persistedDictionary}
            onGenerated={onDictionaryGenerated}
            onDataChange={setDictionaryData}
          />
        </Suspense>
      </KeptMounted>

      <KeptMounted active={activeSection === 'insights'}>
        <Suspense fallback={<SkeletonCardGrid count={3} />}>
          <BusinessInsightsPanel
            key={datasetId}
            table={analysis.table}
            file={file}
            onDataChange={setInsightsData}
          />
        </Suspense>
      </KeptMounted>

      <KeptMounted active={activeSection === 'questions'}>
        <Suspense fallback={<SkeletonList count={2} />}>
          <ClientQuestionsPanel
            key={datasetId}
            columns={analysis.structural.columns}
            qualityReport={analysis.quality}
            onDataChange={setQuestionsData}
          />
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
