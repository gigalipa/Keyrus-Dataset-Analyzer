import { useEffect, useState } from 'react'
import { SECTION_GROUPS, type AppSection } from './sections'
import type { PersistedDataset } from '../../types/persistedDataset'
import type { AnalysisResult } from '../../types/upload'
import { generateAndDownloadPdfReport } from '../../lib/report/pdfReport'

interface SidebarProps {
  activeSection: AppSection
  onSelectSection: (section: AppSection) => void
  /** Mirrors `TopBar`'s gating: footer action buttons only appear once `view.kind === 'active'`. */
  hasActiveDataset?: boolean
  onStartNewDataset?: () => void
  /** Phase 8, Milestone 8.1's single re-run affordance — re-invokes the full LLM pipeline for the active dataset from scratch, replacing the old per-panel "Regenerate" buttons. */
  onRerunAnalysis?: () => void
  /** The active dataset's persisted LLM outputs — feeds the PDF report's Explanation/Business Insights/Client Questions/Data Dictionary sections (Phase 11, Milestone 11.1). `undefined` when no dataset is active. */
  llmOutputs?: PersistedDataset['llmOutputs']
  /** The active dataset's Phase 3 analysis — feeds the PDF report's Overview/Dashboard/Data Quality sections. `undefined` when no dataset is active. */
  analysis?: AnalysisResult
  /** The active dataset's `File` — used for the PDF's file name. `undefined` when no dataset is active. */
  file?: File
  /** The active dataset's cleaning audit trail slot — folded into the PDF's Data Quality section. `undefined` when no dataset is active. */
  cleaning?: PersistedDataset['cleaning']
}

/** Simple hamburger/close glyph for the mobile toggle — inline SVG, no icon library, matching `TopBar`'s `HistoryIcon` convention. */
function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      {open ? (
        <path d="M18 6 6 18M6 6l12 12" />
      ) : (
        <path d="M3 6h18M3 12h18M3 18h18" />
      )}
    </svg>
  )
}

/**
 * Persistent left-sidebar navigation — Phase 7, Milestone 7.2. Two labeled
 * groups (Business information / Data) from `sections.ts`, each item a nav
 * button that highlights when active, plus the "once processing completes"
 * footer actions (Download PDF Report / Upload new dataset) per
 * beyond-MVP.md's user path.
 *
 * Mobile (<640px / below Tailwind's `sm` breakpoint): the sidebar collapses
 * behind a hamburger toggle rendered inline above the center viewport, and
 * slides in as an overlay (fixed, above content, dismissible via its own
 * close button or backdrop tap) so it never obstructs the viewport by
 * default. At `sm` and above it's simply always visible in the flex row,
 * no toggle needed — `AppShell` positions it there.
 */
export function Sidebar({
  activeSection,
  onSelectSection,
  hasActiveDataset = false,
  onStartNewDataset,
  onRerunAnalysis,
  llmOutputs,
  analysis,
  file,
  cleaning,
}: SidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [pdfState, setPdfState] = useState<'idle' | 'generating' | 'error'>('idle')

  // Milestone 11.2 fix: every other dialog in this app (`UploadModal`,
  // `HistoryPanel`, `TopBar`'s KPI modal) dismisses on Escape — this mobile
  // "Sections" overlay didn't, an inconsistency found during cross-cutting
  // keyboard-navigation re-verification. Only listens while open.
  useEffect(() => {
    if (!mobileOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [mobileOpen])

  const handleSelect = (section: AppSection) => {
    onSelectSection(section)
    setMobileOpen(false)
  }

  /**
   * Real PDF generation (Phase 11, Milestone 11.1), replacing the earlier
   * `handleDownloadPdfStub`. No-ops the same way `hasActiveDataset` already
   * gates the footer's visibility: `analysis`/`file`/`llmOutputs` are only
   * ever missing when no dataset is active, in which case this button isn't
   * rendered at all — the guard here is defense-in-depth, not a real UI
   * path.
   *
   * Known minor edge case: `analysis`/`file`/`cleaning` are captured by
   * closure at click-time, so a dataset switch mid-generation can't corrupt
   * the PDF's *content* — but `setPdfState` below could still land after the
   * switch and misleadingly reflect the new dataset's button state. Low
   * impact (single string, self-corrects on the next click); not worth a
   * cancellation mechanism for this.
   */
  const handleDownloadPdf = async () => {
    if (!analysis || !file || !llmOutputs) return
    setPdfState('generating')
    try {
      await generateAndDownloadPdfReport(analysis, file, llmOutputs, cleaning)
      setPdfState('idle')
    } catch (error) {
      console.error('[Sidebar] Failed to generate PDF report:', error)
      setPdfState('error')
    }
  }

  const nav = (
    <nav aria-label="Sections" className="flex flex-1 flex-col gap-6 overflow-y-auto p-4">
      {SECTION_GROUPS.map((group) => (
        <div key={group.id} className="flex flex-col gap-1">
          <h2 className="px-2 text-xs font-semibold tracking-wide text-slate-400 uppercase dark:text-slate-500">
            {group.label}
          </h2>
          <ul className="flex flex-col gap-0.5">
            {group.sections.map((section) => {
              const isActive = section.id === activeSection
              return (
                <li key={section.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(section.id)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`w-full rounded-md px-2 py-1.5 text-left text-sm font-medium ${
                      isActive
                        ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                    }`}
                  >
                    {section.label}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )

  const footer = hasActiveDataset && (
    <div className="flex flex-col gap-2 border-t border-slate-200 p-4 dark:border-slate-800">
      <button
        type="button"
        onClick={() => void handleDownloadPdf()}
        disabled={pdfState === 'generating'}
        title="Downloads a client-presentable PDF covering the dashboard, explanation, business insights, questions, and data quality summary"
        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-800"
      >
        {pdfState === 'generating' ? 'Generating PDF...' : 'Download PDF Report'}
      </button>
      {pdfState === 'error' && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          Couldn't generate the PDF report. Try again.
        </p>
      )}
      <button
        type="button"
        onClick={onRerunAnalysis}
        title="Re-runs the data dictionary, business insights, explanation, and client questions from scratch"
        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:border-slate-400 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-800"
      >
        Re-run analysis
      </button>
      <button
        type="button"
        onClick={onStartNewDataset}
        className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
      >
        Upload new dataset
      </button>
    </div>
  )

  return (
    <>
      {/* Mobile toggle — only rendered below `sm`, sits above the center viewport. */}
      <div className="border-b border-slate-200 p-2 sm:hidden dark:border-slate-800">
        <button
          type="button"
          onClick={() => setMobileOpen((open) => !open)}
          aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'}
          aria-expanded={mobileOpen}
          className="flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:border-slate-400 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-800"
        >
          <MenuIcon open={mobileOpen} />
          Sections
        </button>
      </div>

      {/* Mobile overlay sidebar. */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 sm:hidden">
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Sections"
            className="absolute top-0 left-0 flex h-full w-full max-w-xs flex-col border-r border-slate-200 bg-slate-100 shadow-xl dark:border-slate-800 dark:bg-slate-950"
          >
            {nav}
            {footer}
          </div>
        </div>
      )}

      {/* Desktop/persistent sidebar. */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-slate-100 sm:flex dark:border-slate-800 dark:bg-slate-950">
        {nav}
        {footer}
      </aside>
    </>
  )
}
