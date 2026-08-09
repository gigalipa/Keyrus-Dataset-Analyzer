import { useState } from 'react'
import { SECTION_GROUPS, type AppSection } from './sections'

interface SidebarProps {
  activeSection: AppSection
  onSelectSection: (section: AppSection) => void
  /** Mirrors `TopBar`'s gating: footer action buttons only appear once `view.kind === 'active'`. */
  hasActiveDataset?: boolean
  onStartNewDataset?: () => void
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
}: SidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false)

  const handleSelect = (section: AppSection) => {
    onSelectSection(section)
    setMobileOpen(false)
  }

  const handleDownloadPdfStub = () => {
    // Real PDF generation is Phase 11 — this is a deliberate, honest stub
    // for Milestone 7.2. Left clickable (not disabled) so the affordance
    // reads as "present but not yet implemented" rather than broken, with a
    // clear console signal for anyone testing the flow before Phase 11.
    console.log('[Sidebar] Download PDF Report is not implemented yet (Phase 11).')
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
        onClick={handleDownloadPdfStub}
        title="Coming soon — PDF report generation lands in a later phase"
        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:border-slate-400 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-800"
      >
        Download PDF Report
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
