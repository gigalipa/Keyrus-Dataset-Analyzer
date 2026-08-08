import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import type { AnalysisResult } from '../../types/upload'
import { DataOverviewCard } from './DataOverviewCard'
import { DataQualitySummaryCard } from './DataQualitySummaryCard'
import { ColumnDetailView } from './ColumnDetailView'
import { ResultsTabNav, type ResultsTab } from './ResultsTabNav'
import type { InsightGroup, InsightItem } from '../../lib/llm/schema'
import type { BusinessInsightsResult } from '../../lib/llm/businessInsights'
import {
  buildMarkdownReport,
  downloadMarkdown,
  reportFileName,
} from '../../lib/report/markdownReport'
import { SkeletonCardGrid } from '../shared/Skeleton'

/**
 * Lazy-loaded rather than statically imported (light-touch bundle-size
 * improvement noted alongside Milestone 5.3): these three panels pull in
 * the LLM call plumbing, and `ClientQuestionsPanel` in particular pulls in
 * the `@google/genai` SDK, none of which are needed until their tab is
 * actually opened. Splitting them out keeps that weight out of the main
 * bundle that has to load before the user sees anything.
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

interface ResultsViewProps {
  analysis: AnalysisResult
  file: File
}

const TABS: ResultsTab[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'quality', label: 'Data Quality' },
  { id: 'dictionary', label: 'Data Dictionary' },
  { id: 'insights', label: 'Business Insights' },
  { id: 'questions', label: 'Client Questions' },
]

/**
 * Fallback-only ceiling (ms) for how long to suppress
 * `IntersectionObserver`-driven active-tab updates after a tab click, used
 * only if the browser never reports `scrollend` (the primary signal — see
 * `handleSelectTab`). Generous on purpose since it's a safety net, not the
 * common path.
 */
const SCROLL_SUPPRESS_MS = 2000

/** Extra breathing room (px) above a scrolled-to section, on top of the sticky tab bar's own height. */
const SCROLL_OFFSET_PADDING = 16

/**
 * Phase 5, Milestone 5.2 — composes the five result sections (Overview,
 * Data Quality, Data Dictionary, Business Insights, Client Questions) below
 * a sticky, keyboard-navigable tab bar (`ResultsTabNav`). Sections stay
 * stacked in the DOM; clicking a tab smooth-scrolls to its section and an
 * `IntersectionObserver` keeps the active tab in sync as the user scrolls
 * manually, so "tabs" and "scroll-to-section" work together rather than as
 * two competing navigation metaphors.
 *
 * Column-detail (structure-oriented) lives in the Overview tab alongside the
 * dataset summary card; data-quality metrics get their own tab; the
 * dictionary and the two LLM-generated panels (insights, questions — both
 * still manual-trigger, wired in here for the first time) each get a tab.
 */
export function ResultsView({ analysis, file }: ResultsViewProps) {
  const [activeTabId, setActiveTabId] = useState<string>(TABS[0].id)
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map())
  const navRef = useRef<HTMLDivElement>(null)
  const suppressUntilRef = useRef(0)

  // Milestone 5.3 "download report button": the three LLM panels each own
  // their own generation lifecycle, but the Markdown report needs whatever
  // they've already produced (if anything). Each panel reports its latest
  // generated data up here via `onDataChange` rather than this component
  // reaching into their internals.
  const [dictionaryData, setDictionaryData] = useState<InsightGroup | null>(
    null,
  )
  const [insightsData, setInsightsData] =
    useState<BusinessInsightsResult | null>(null)
  const [questionsData, setQuestionsData] = useState<InsightItem[] | null>(null)

  const handleDownloadReport = () => {
    const report = buildMarkdownReport(analysis, file, {
      dictionary: dictionaryData,
      businessInsights: insightsData,
      clientQuestions: questionsData,
    })
    downloadMarkdown(reportFileName(file.name), report)
  }

  useEffect(() => {
    const sections = sectionRefs.current
    const observer = new IntersectionObserver(
      (entries) => {
        if (Date.now() < suppressUntilRef.current) return

        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)

        if (visible.length > 0) {
          const id = visible[0].target.getAttribute('data-section-id')
          if (id) setActiveTabId(id)
        }
      },
      {
        // Treat a section as "current" once it clears the sticky tab bar
        // near the top of the viewport, well before it reaches the bottom.
        rootMargin: '-120px 0px -70% 0px',
        threshold: 0,
      },
    )

    for (const el of sections.values()) observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const handleSelectTab = (id: string) => {
    setActiveTabId(id)
    const section = sectionRefs.current.get(id)
    if (!section) return

    // Suppress the scrollspy for the duration of the smooth scroll, so a
    // section transiently passing through the viewport mid-flight doesn't
    // flicker the active tab before landing on the clicked one. A fixed
    // timeout alone is fragile — a long scroll (e.g. Overview to Client
    // Questions on a tall results page) can easily outlast a short guess —
    // so suppress indefinitely and clear it precisely when the browser
    // reports the scroll has actually finished (`scrollend`), falling back
    // to `SCROLL_SUPPRESS_MS` only as a safety net for browsers that don't
    // support the event (older Safari) or if it never fires.
    suppressUntilRef.current = Number.POSITIVE_INFINITY
    const clearSuppression = () => {
      suppressUntilRef.current = 0
    }
    window.addEventListener('scrollend', clearSuppression, { once: true })
    const fallbackTimer = window.setTimeout(() => {
      window.removeEventListener('scrollend', clearSuppression)
      clearSuppression()
    }, SCROLL_SUPPRESS_MS)

    const navHeight = navRef.current?.offsetHeight ?? 0
    const top =
      section.getBoundingClientRect().top +
      window.scrollY -
      navHeight -
      SCROLL_OFFSET_PADDING
    window.scrollTo({ top, behavior: 'smooth' })

    // If `scrollend` does fire, no need to wait out the fallback timer too.
    window.addEventListener(
      'scrollend',
      () => window.clearTimeout(fallbackTimer),
      { once: true },
    )
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

      <ResultsTabNav
        containerRef={navRef}
        tabs={TABS}
        activeTabId={activeTabId}
        onSelectTab={handleSelectTab}
      />

      <section
        ref={(el) => {
          if (el) sectionRefs.current.set('overview', el)
          else sectionRefs.current.delete('overview')
        }}
        data-section-id="overview"
        id="results-panel-overview"
        role="tabpanel"
        aria-labelledby="results-tab-overview"
        tabIndex={-1}
        className="flex scroll-mt-32 flex-col gap-6"
      >
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
      </section>

      <section
        ref={(el) => {
          if (el) sectionRefs.current.set('quality', el)
          else sectionRefs.current.delete('quality')
        }}
        data-section-id="quality"
        id="results-panel-quality"
        role="tabpanel"
        aria-labelledby="results-tab-quality"
        tabIndex={-1}
        className="scroll-mt-32"
      >
        <DataQualitySummaryCard
          quality={analysis.quality}
          numeric={analysis.numeric}
          totalRows={analysis.structural.stats.totalRows}
        />
      </section>

      <section
        ref={(el) => {
          if (el) sectionRefs.current.set('dictionary', el)
          else sectionRefs.current.delete('dictionary')
        }}
        data-section-id="dictionary"
        id="results-panel-dictionary"
        role="tabpanel"
        aria-labelledby="results-tab-dictionary"
        tabIndex={-1}
        className="scroll-mt-32"
      >
        <Suspense fallback={<SkeletonCardGrid count={3} />}>
          <DataDictionaryPanel
            analysis={analysis.structural}
            datasetName={file.name}
            onDataChange={setDictionaryData}
          />
        </Suspense>
      </section>

      <section
        ref={(el) => {
          if (el) sectionRefs.current.set('insights', el)
          else sectionRefs.current.delete('insights')
        }}
        data-section-id="insights"
        id="results-panel-insights"
        role="tabpanel"
        aria-labelledby="results-tab-insights"
        tabIndex={-1}
        className="scroll-mt-32"
      >
        <Suspense fallback={<SkeletonCardGrid count={3} />}>
          <BusinessInsightsPanel
            table={analysis.table}
            file={file}
            onDataChange={setInsightsData}
          />
        </Suspense>
      </section>

      <section
        ref={(el) => {
          if (el) sectionRefs.current.set('questions', el)
          else sectionRefs.current.delete('questions')
        }}
        data-section-id="questions"
        id="results-panel-questions"
        role="tabpanel"
        aria-labelledby="results-tab-questions"
        tabIndex={-1}
        className="scroll-mt-32"
      >
        <Suspense fallback={<SkeletonCardGrid count={2} />}>
          <ClientQuestionsPanel
            columns={analysis.structural.columns}
            qualityReport={analysis.quality}
            onDataChange={setQuestionsData}
          />
        </Suspense>
      </section>

      {/*
        Bottom spacer so the last section(s) can still scroll flush under
        the sticky tab bar — without it, a tab near the end of a short page
        can hit the browser's max-scroll clamp before its section reaches
        the top of the viewport.
      */}
      <div aria-hidden="true" className="h-screen" />
    </div>
  )
}
