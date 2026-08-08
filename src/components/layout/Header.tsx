/**
 * Application header displaying the product title and a short tagline.
 */
export function Header() {
  return (
    <header className="border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
      <div className="mx-auto flex max-w-5xl flex-col gap-1 px-4 py-4 sm:px-6 lg:px-8">
        <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl dark:text-slate-100">
          Data Consultant App
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Upload a client dataset and get an honest, non-technical first read.
        </p>
      </div>
    </header>
  )
}
