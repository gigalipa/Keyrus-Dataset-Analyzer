import type { KeyboardEvent, Ref } from 'react'
import { useRef } from 'react'

export interface ResultsTab {
  id: string
  label: string
}

/** Resolves the roving-tabindex target index for arrow/Home/End key presses, or `null` for other keys. */
function getNextTabIndex(
  key: string,
  currentIndex: number,
  tabCount: number,
): number | null {
  switch (key) {
    case 'ArrowRight':
      return (currentIndex + 1) % tabCount
    case 'ArrowLeft':
      return (currentIndex - 1 + tabCount) % tabCount
    case 'Home':
      return 0
    case 'End':
      return tabCount - 1
    default:
      return null
  }
}

interface ResultsTabNavProps {
  tabs: ResultsTab[]
  activeTabId: string
  onSelectTab: (id: string) => void
  /**
   * Ref attached directly to the sticky tablist's root element (React 19
   * allows function components to accept `ref` as a plain prop). Must land
   * on this element itself rather than a wrapping `<div>` — a wrapper whose
   * height equals the tablist's own height gives `position: sticky` no room
   * to stay pinned as the page scrolls past it, so it unsticks almost
   * immediately instead of staying visible.
   */
  containerRef?: Ref<HTMLDivElement>
}

/**
 * Sticky ARIA tablist for navigating the stacked results sections below it
 * (Phase 5, Milestone 5.2). Follows the WAI-ARIA "Tabs with Automatic
 * Activation" pattern for keyboard support — roving `tabindex`, and
 * Left/Right/Home/End move focus *and* activate the tab, which here means
 * scrolling its section into view and marking it active.
 *
 * Unlike a textbook tabs widget, the "panels" below stay simultaneously
 * visible (stacked, scrollspy-style) rather than only one at a time — that's
 * the deliberate reconciliation of "tabs" with "scroll-to-section" called
 * for by this milestone. The `role="tab"`/`aria-selected`/`aria-controls`
 * wiring still gives assistive tech a clear, standard way to jump between
 * sections even though the controlled elements don't hide/show.
 */
export function ResultsTabNav({
  tabs,
  activeTabId,
  onSelectTab,
  containerRef,
}: ResultsTabNavProps) {
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map())

  const focusAndSelect = (id: string) => {
    onSelectTab(id)
    tabRefs.current.get(id)?.focus()
  }

  const handleKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    const nextIndex = getNextTabIndex(event.key, index, tabs.length)
    if (nextIndex === null) return
    event.preventDefault()
    focusAndSelect(tabs[nextIndex].id)
  }

  return (
    <div
      ref={containerRef}
      role="tablist"
      aria-label="Results sections"
      className="sticky top-0 z-10 -mx-4 flex gap-1 overflow-x-auto border-b border-slate-200 bg-white/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 dark:border-slate-800 dark:bg-slate-900/95"
    >
      {tabs.map((tab, index) => {
        const isActive = tab.id === activeTabId
        return (
          <button
            key={tab.id}
            ref={(el) => {
              if (el) tabRefs.current.set(tab.id, el)
              else tabRefs.current.delete(tab.id)
            }}
            id={`results-tab-${tab.id}`}
            role="tab"
            type="button"
            aria-selected={isActive}
            aria-controls={`results-panel-${tab.id}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onSelectTab(tab.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={`shrink-0 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors ${
              isActive
                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
            }`}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
