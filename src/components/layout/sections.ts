/**
 * Left-sidebar section catalog — Phase 7, Milestone 7.2.
 *
 * Single source of truth for the 8 destinations beyond-MVP.md's left bar
 * describes, grouped into "Business information" and "Data". `Sidebar.tsx`
 * renders this list; `App.tsx` owns which one is active. Milestone 7.3
 * consumes the same `AppSection` type and `SECTION_GROUPS`/`SECTION_LABELS`
 * when it wires real per-section content in place of this milestone's
 * placeholder viewport — nothing here should need to change for that.
 */

export type AppSection =
  | 'dashboard'
  | 'explanation'
  | 'insights'
  | 'questions'
  | 'overview'
  | 'dictionary'
  | 'quality'
  | 'datasets'

export interface SectionDefinition {
  id: AppSection
  label: string
}

export interface SectionGroup {
  id: 'business' | 'data'
  label: string
  sections: SectionDefinition[]
}

export const SECTION_GROUPS: SectionGroup[] = [
  {
    id: 'business',
    label: 'Business information',
    sections: [
      { id: 'dashboard', label: 'Dashboard' },
      { id: 'explanation', label: 'Explanation' },
      { id: 'insights', label: 'Business Insights' },
      { id: 'questions', label: 'Questions' },
    ],
  },
  {
    id: 'data',
    label: 'Data',
    sections: [
      { id: 'overview', label: 'Overview' },
      { id: 'dictionary', label: 'Data Dictionary' },
      { id: 'quality', label: 'Quality' },
      { id: 'datasets', label: 'Datasets' },
    ],
  },
]

/** Flat `AppSection -> label` lookup, derived from `SECTION_GROUPS`. */
export const SECTION_LABELS: Record<AppSection, string> = SECTION_GROUPS.reduce(
  (labels, group) => {
    for (const section of group.sections) {
      labels[section.id] = section.label
    }
    return labels
  },
  {} as Record<AppSection, string>,
)

/** Default active section once a dataset is active. */
export const DEFAULT_SECTION: AppSection = 'dashboard'
