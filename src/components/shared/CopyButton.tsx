import { useCopyToClipboard } from '../../hooks/useCopyToClipboard'

interface CopyButtonProps {
  /** The exact text copied to the clipboard when clicked. */
  text: string
  /** Accessible label, e.g. `Copy insight: Revenue is concentrated in Q4`. */
  label: string
  className?: string
}

/**
 * Small reusable copy-to-clipboard button built on `useCopyToClipboard`,
 * reusing the confirmation pattern `ClientQuestionsPanel` established first
 * (Phase 5, Milestone 5.3). Used by `BusinessInsightsPanel` for insights and
 * recommendations, and available for any other item-level copy action.
 */
export function CopyButton({ text, label, className = '' }: CopyButtonProps) {
  const { copied, copy } = useCopyToClipboard()

  return (
    <button
      type="button"
      onClick={() => void copy(text)}
      aria-label={label}
      className={`shrink-0 rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:border-slate-400 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600 ${className}`}
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  )
}
