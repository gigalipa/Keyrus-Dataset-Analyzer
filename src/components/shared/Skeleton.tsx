/**
 * Phase 5, Milestone 5.3 "loading skeletons" — small pulsing placeholder
 * primitives shared by every panel that shows an LLM-loading or
 * preview-loading state, so content areas show placeholder shapes instead of
 * empty space or a bare spinner-only message while waiting.
 */

interface SkeletonProps {
  /** Extra Tailwind classes controlling size/shape (width, height, rounding). */
  className?: string
}

/** A single pulsing gray block. Compose these to approximate the shape of the content that will load in. */
export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-md bg-slate-200 dark:bg-slate-700 ${className}`}
    />
  )
}

/** A card-shaped skeleton roughly matching a KPI/dictionary/insight card. */
export function SkeletonCard({ className = '' }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={`flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 ${className}`}
    >
      <Skeleton className="h-3 w-1/3" />
      <Skeleton className="h-5 w-2/3" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-4/5" />
    </div>
  )
}

/** A grid of `count` card-shaped skeletons, matching the KPI/dictionary card grid layouts. */
export function SkeletonCardGrid({
  count = 3,
  className = 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3',
}: {
  count?: number
  className?: string
}) {
  return (
    <div className={className}>
      {Array.from({ length: count }, (_, index) => (
        <SkeletonCard key={index} />
      ))}
    </div>
  )
}

/** A single list-row skeleton, roughly matching a bullet/question list item. */
export function SkeletonListItem({ className = '' }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={`flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 ${className}`}
    >
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-3/4" />
    </div>
  )
}

/** A stack of `count` list-row skeletons. */
export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: count }, (_, index) => (
        <SkeletonListItem key={index} />
      ))}
    </div>
  )
}
