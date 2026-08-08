import type { ReactNode } from 'react'
import { Header } from './Header'
import { Footer } from './Footer'

interface AppShellProps {
  children: ReactNode
}

/**
 * Top-level page shell: header, scrollable main content area, and footer.
 * Stacks full-height on mobile (≥320px) and centers a constrained-width
 * content column on larger viewports (up to and beyond 1200px).
 */
export function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex min-h-svh flex-col bg-slate-50 dark:bg-slate-900">
      <Header />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
      <Footer />
    </div>
  )
}
