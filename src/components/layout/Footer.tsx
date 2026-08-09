/**
 * Application footer with a brief privacy/processing note.
 */
export function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-slate-100/90 dark:border-slate-800 dark:bg-slate-950/90">
      <div className="mx-auto max-w-5xl px-4 py-4 text-center text-xs text-slate-500 sm:px-6 lg:px-8 dark:text-slate-500">
        Runs entirely in your browser — files are never uploaded to a server.
      </div>
    </footer>
  )
}
