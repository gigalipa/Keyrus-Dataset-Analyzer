import type { ReactNode } from 'react'
import { TopBar } from './TopBar'
import { Footer } from './Footer'
import { Sidebar } from './Sidebar'
import type { AppSection } from './sections'
import type { PersistedDataset } from '../../types/persistedDataset'
import type { AnalysisResult } from '../../types/upload'

interface AppShellProps {
  children: ReactNode
  historyCount?: number
  onOpenHistory?: () => void
  hasActiveDataset?: boolean
  /** The active dataset's persisted LLM outputs (`view.llmOutputs` when `view.kind === 'active'`), threaded down to `TopBar` so it can read the `businessInsights` slot's KPIs — Phase 8, Milestone 8.3. `undefined` when no dataset is active. */
  llmOutputs?: PersistedDataset['llmOutputs']
  /** The active dataset's Phase 3 analysis (`view.analysis`) — threaded down to `Sidebar` for the "Download PDF Report" button (Phase 11, Milestone 11.1). `undefined` when no dataset is active. */
  analysis?: AnalysisResult
  /** The active dataset's `File` (`view.file`) — used for the PDF's file name/overview, same source `MainViewport`'s Markdown report reads. `undefined` when no dataset is active. */
  file?: File
  /** The active dataset's cleaning audit trail slot (`view.cleaning`) — folded into the PDF's Data Quality section as a compact "how issues were managed" summary. `undefined` when no dataset is active. */
  cleaning?: PersistedDataset['cleaning']
  activeSection: AppSection
  onSelectSection: (section: AppSection) => void
  onStartNewDataset?: () => void
  /** Wired to `Sidebar`'s "Re-run analysis" footer button — re-invokes the full LLM pipeline for the active dataset from scratch. */
  onRerunAnalysis?: () => void
}

/**
 * Top-level page shell — Phase 7. `TopBar` spans the full width at the top;
 * below it, a flex row holds the persistent left `Sidebar` (collapsible on
 * mobile, see `Sidebar.tsx`) and the center viewport (`children`), with
 * `Footer` closing out the page. Replaces the earlier single-column
 * `TopBar` + `<main>` + `Footer` stack from Milestone 7.1 now that the left
 * bar exists.
 *
 * Layout fix (found in live Phase 7 testing): the shell used to only set a
 * *minimum* height (`min-h-svh`) with no scroll boundary of its own, so once
 * the center content grew taller than the viewport, the whole page —
 * including the sidebar — scrolled together, hiding the sidebar's footer
 * buttons ("Download PDF Report" / "Upload new dataset") off-screen. The
 * shell is now pinned to exactly the viewport height (`h-svh overflow-
 * hidden`) with only `<main>` scrolling internally; `TopBar`, `Sidebar`, and
 * `Footer` stay put.
 *
 * Also per that feedback: the center viewport now reads as a slightly
 * *lighter* surface than the surrounding chrome (`TopBar`/`Sidebar`/
 * `Footer`), rather than the reverse — the chrome carries the muted
 * `slate-100`/`slate-950` tone, `<main>` is `white`/`slate-900`.
 */
export function AppShell({
  children,
  historyCount,
  onOpenHistory,
  hasActiveDataset,
  llmOutputs,
  analysis,
  file,
  cleaning,
  activeSection,
  onSelectSection,
  onStartNewDataset,
  onRerunAnalysis,
}: AppShellProps) {
  return (
    <div className="flex h-svh flex-col overflow-hidden bg-slate-100 dark:bg-slate-950">
      <TopBar
        historyCount={historyCount}
        onOpenHistory={onOpenHistory}
        hasActiveDataset={hasActiveDataset}
        llmOutputs={llmOutputs}
      />
      <div className="flex min-h-0 flex-1">
        <Sidebar
          activeSection={activeSection}
          onSelectSection={onSelectSection}
          hasActiveDataset={hasActiveDataset}
          onStartNewDataset={onStartNewDataset}
          onRerunAnalysis={onRerunAnalysis}
          llmOutputs={llmOutputs}
          analysis={analysis}
          file={file}
          cleaning={cleaning}
        />
        <main className="min-w-0 flex-1 overflow-y-auto bg-white dark:bg-slate-900">
          <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
            {children}
          </div>
        </main>
      </div>
      <Footer />
    </div>
  )
}
