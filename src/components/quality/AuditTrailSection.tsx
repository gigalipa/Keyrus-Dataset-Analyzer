import type {
  AuditChangeType,
  AuditTrailEntry,
} from '../../lib/etl/applyCleaningPlan'
import type { PersistedDataset } from '../../types/persistedDataset'

interface AuditTrailSectionProps {
  /** This dataset's `cleaning` step slot (Milestone 10.2/10.3) — the pipeline is the only thing that ever writes to it. */
  slot: PersistedDataset['cleaning']
}

/** Group order/labels — matches `applyCleaningPlan.ts`'s own documented application order (value mappings, then missing-value policy, then type coercion), with skipped/invalid entries called out last since they represent proposals the engine refused to apply. */
const GROUP_ORDER: AuditChangeType[] = [
  'value-mapping',
  'missing-value-policy',
  'type-coercion',
  'skipped-invalid-column',
]

const GROUP_LABEL: Record<AuditChangeType, string> = {
  'value-mapping': 'Value unification',
  'missing-value-policy': 'Missing-value handling',
  'type-coercion': 'Type coercion',
  'skipped-invalid-column': 'Skipped / flagged, not auto-fixed',
}

const GROUP_DESCRIPTION: Record<AuditChangeType, string> = {
  'value-mapping':
    'Categorical values the cleaning plan identified as variants of the same thing (casing, spacing, synonyms) and unified.',
  'missing-value-policy':
    'How missing values in each column were handled — filled with a default, dropped, or intentionally left as-is.',
  'type-coercion':
    'Columns whose values were converted to a consistent data type.',
  'skipped-invalid-column':
    'Plan entries the ETL engine could not safely apply (e.g. a column that does not exist in this dataset) — proposed by the LLM but correctly refused, not applied.',
}

/**
 * Phase 10, Milestone 10.5 "how issues were managed" section — the
 * verification surface for this phase's LLM-informed cleaning: renders
 * Milestone 10.2's `AuditTrail` (`applyCleaningPlan.ts`) in plain language,
 * grouped by `changeType`, with each entry's affected-row count and the
 * cleaning plan's own stated reason quoted verbatim (never paraphrased) —
 * this is the whole point of the audit trail existing at all.
 *
 * Positioned in `MainViewport.tsx` alongside `DataQualitySummaryCard`
 * (Milestone 10.4): that card shows what quality issues *remain* after
 * cleaning; this section shows what was *done* to get there.
 *
 * In practice `slot.status` should always be `'done'` by the time Quality is
 * visible at all — the loading overlay covers every pipeline step including
 * `clean` (Milestone 10.3), the same assumption Milestone 10.4 confirmed for
 * Overview. The `pending`/`running`/`error` branches below are handled
 * anyway, defensively, rather than assumed unreachable.
 */
export function AuditTrailSection({ slot }: AuditTrailSectionProps) {
  return (
    <section
      aria-labelledby="audit-trail-heading"
      className="flex flex-col gap-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 dark:border-slate-800 dark:bg-slate-900"
    >
      <div>
        <h2
          id="audit-trail-heading"
          className="text-lg font-semibold text-slate-900 dark:text-slate-100"
        >
          How issues were managed
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Every automated change the cleaning plan made to the raw data, with
          the reason behind each one.
        </p>
      </div>

      {(slot.status === 'pending' || slot.status === 'running') && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300"
        >
          <span
            aria-hidden="true"
            className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
          />
          <span>Cleaning is still in progress...</span>
        </div>
      )}

      {slot.status === 'error' && (
        <div
          role="alert"
          className="flex flex-col gap-1 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
        >
          <span>
            {slot.errorMessage ?? 'Something went wrong cleaning this dataset.'}
          </span>
          <span className="text-xs text-red-700 dark:text-red-400">
            Use "Re-run analysis" (in the sidebar) to try again.
          </span>
        </div>
      )}

      {slot.status === 'done' && slot.data && (
        <AuditTrailBody entries={slot.data.entries} />
      )}
    </section>
  )
}

function AuditTrailBody({ entries }: { entries: AuditTrailEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-slate-600 dark:text-slate-400">
        The cleaning plan found nothing to fix — this dataset needed no
        automated changes.
      </p>
    )
  }

  const grouped = new Map<AuditChangeType, AuditTrailEntry[]>()
  for (const changeType of GROUP_ORDER) grouped.set(changeType, [])
  for (const entry of entries) {
    grouped.get(entry.changeType)?.push(entry)
  }

  return (
    <div className="flex flex-col gap-6">
      {GROUP_ORDER.map((changeType) => {
        const groupEntries = grouped.get(changeType) ?? []
        if (groupEntries.length === 0) return null
        return (
          <AuditTrailGroup
            key={changeType}
            changeType={changeType}
            entries={groupEntries}
          />
        )
      })}
    </div>
  )
}

function AuditTrailGroup({
  changeType,
  entries,
}: {
  changeType: AuditChangeType
  entries: AuditTrailEntry[]
}) {
  const isSkippedGroup = changeType === 'skipped-invalid-column'

  return (
    <div className="flex flex-col gap-2">
      <div>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {GROUP_LABEL[changeType]}{' '}
          <span className="font-normal text-slate-500 dark:text-slate-400">
            ({entries.length})
          </span>
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {GROUP_DESCRIPTION[changeType]}
        </p>
      </div>

      <ul className="flex flex-col gap-2">
        {entries.map((entry, index) => (
          <AuditTrailEntryRow
            key={`${entry.columnName}-${index}`}
            entry={entry}
            isSkippedGroup={isSkippedGroup}
          />
        ))}
      </ul>
    </div>
  )
}

function AuditTrailEntryRow({
  entry,
  isSkippedGroup,
}: {
  entry: AuditTrailEntry
  isSkippedGroup: boolean
}) {
  // Visually distinct treatment for anything not actually applied — skipped
  // plan entries and intentional no-ops (e.g. `leave-null`) alike, since
  // both mean "no change landed in the cleaned table," which the audit trail
  // must never obscure by rendering it identically to an applied change.
  const notApplied = !entry.applied

  return (
    <li
      className={`flex flex-col gap-1.5 rounded-lg border px-3 py-2.5 text-sm ${
        isSkippedGroup || notApplied
          ? 'border-dashed border-amber-300 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/30'
          : 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/40'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs font-semibold text-slate-800 dark:text-slate-200">
            {entry.columnName}
          </span>
          {notApplied && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-900 dark:text-amber-300">
              Not applied
            </span>
          )}
        </div>
        {entry.applied && (
          <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">
            {entry.affectedRows.toLocaleString()} row
            {entry.affectedRows === 1 ? '' : 's'} affected
          </span>
        )}
      </div>

      <p className="text-slate-700 dark:text-slate-300">{entry.description}</p>

      <p className="text-xs text-slate-600 italic dark:text-slate-400">
        Reason: &ldquo;{entry.reason}&rdquo;
      </p>
    </li>
  )
}
