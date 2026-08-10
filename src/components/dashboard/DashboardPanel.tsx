import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { AnalysisResult } from '../../types/upload'
import type { LlmOutputSlot } from '../../types/persistedDataset'
import { asBusinessInsights } from '../../types/persistedDataset'
import type { QualitySeverity } from '../../lib/analysis/quality'
import { analyzeDataQuality } from '../../lib/analysis/quality'
import { analyzeNumericColumns } from '../../lib/analysis/numeric'
import { analyzeDateColumns } from '../../lib/analysis/dates'
import type { DashboardChartSpec } from '../../lib/dashboard/dashboardMetrics'
import {
  chooseDashboardCharts,
  chooseDateColumn,
  chooseFilterColumn,
  chooseMeasureColumn,
  chooseSecondaryCategoricalColumn,
  computeDashboardKpis,
  computeDashboardNotices,
  filterTableByCategory,
  findCategoricalCandidates,
} from '../../lib/dashboard/dashboardMetrics'
import { SkeletonList } from '../shared/Skeleton'

interface DashboardPanelProps {
  analysis: AnalysisResult
  /** This dataset's `llmOutputs.businessInsights` slot — only its `insights` group feeds the "Quick insights" section below (static, generated once by the pipeline; not re-fetched per filter change). */
  businessInsightsSlot: LlmOutputSlot
}

const SEVERITY_BADGE_STYLES: Record<QualitySeverity, string> = {
  info: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300',
  warning:
    'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300',
  error: 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300',
}

/** Fixed categorical hue order for the category-breakdown bar chart — colors follow the entity (category), never cycled/re-assigned by rank. Beyond this many slots, `computeCategoryBreakdown` already folds the remainder into "Other" (last slot below, gray). */
const CATEGORY_COLORS: { light: string; dark: string }[] = [
  { light: '#2563eb', dark: '#60a5fa' }, // blue
  { light: '#d97706', dark: '#fbbf24' }, // amber
  { light: '#059669', dark: '#34d399' }, // emerald
  { light: '#7c3aed', dark: '#a78bfa' }, // violet
  { light: '#e11d48', dark: '#fb7185' }, // rose
  { light: '#0891b2', dark: '#22d3ee' }, // cyan
  { light: '#64748b', dark: '#94a3b8' }, // slate ("Other")
]

/**
 * Tracks `prefers-color-scheme` at runtime. Needed because Recharts renders
 * plain SVG with inline color props, not Tailwind classes — `dark:` variants
 * (which this app relies on everywhere else) never reach it, so chart colors
 * have to be picked in JS. This app has no in-app light/dark toggle (Tailwind
 * v4 default: `dark:` follows the OS setting only), so the media query is
 * the single source of truth here too.
 */
function usePrefersDark(): boolean {
  const [prefersDark, setPrefersDark] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches,
  )

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (event: MediaQueryListEvent) => setPrefersDark(event.matches)
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  return prefersDark
}

/**
 * Dashboard section — Phase 9, Milestone 9.1. Per `docs/beyond-MVP.md`'s
 * "full-fledged interactive data analysis dashboard ... KPIs, notices, quick
 * insights and graphs ... filters which affect every piece of information
 * shown in it."
 *
 * ## The filter column
 *
 * Auto-detected by `chooseFilterColumn` (`dashboardMetrics.ts`) from
 * `analysis.structural.columns`: among string columns with 2-15 distinct
 * non-empty values, it picks the one with the fewest
 * `analyzeDataQuality`-flagged near-duplicate/casing groups. On the fixture
 * dataset (`docs/lakeside_orders_sample.csv`) this lands on `cust_seg_cd`
 * (8 codes: A1/A2/B1/B2/C1/C3/X9 plus a handful of blanks, zero
 * near-duplicate flags) rather than e.g. `chnl`/`ord_status`/`prod_cat`,
 * which are also low-cardinality but riddled with casing/spacing variants
 * ("WEB" / "web" / "Web") that would otherwise show up as separate,
 * confusing filter chips.
 *
 * ## KPIs, notices, and charts: computed live; quick insights: static
 *
 * See `dashboardMetrics.ts`'s module doc for the full rationale. Short
 * version: KPIs/notices/charts are cheap, pure functions re-run against the
 * filtered table on every filter change (no LLM call, instant); "Quick
 * insights" reuses the pipeline's already-generated
 * `businessInsights.insights` (top items only) and is explicitly captioned
 * as dataset-wide so it doesn't read as if it were reacting to the filter.
 */
export function DashboardPanel({ analysis, businessInsightsSlot }: DashboardPanelProps) {
  const prefersDark = usePrefersDark()
  const [selectedValue, setSelectedValue] = useState<string | null>(null)

  const { structural, quality, numeric, dates, table } = analysis

  // Column choices are derived from the full (unfiltered) dataset once —
  // which column drives the filter, which numeric column is the headline
  // measure, etc. — and stay stable as the filter itself changes.
  const categoricalCandidates = useMemo(
    () => findCategoricalCandidates(table, structural.columns, quality),
    [table, structural.columns, quality],
  )
  const filterColumn = useMemo(
    () => chooseFilterColumn(categoricalCandidates),
    [categoricalCandidates],
  )
  const secondaryColumn = useMemo(
    () =>
      filterColumn
        ? chooseSecondaryCategoricalColumn(categoricalCandidates, filterColumn.column)
        : null,
    [categoricalCandidates, filterColumn],
  )
  const measureColumn = useMemo(() => chooseMeasureColumn(numeric), [numeric])
  const trendDateColumn = useMemo(() => chooseDateColumn(dates), [dates])

  // Derived rather than synced via an effect: if the selected value no
  // longer exists for this dataset (shouldn't normally happen, but keeps
  // this defensive the same way BusinessInsightsPanel's tag filter is), it
  // just falls back to "All" without an extra render pass.
  const effectiveSelectedValue =
    selectedValue && filterColumn?.distinctValues.includes(selectedValue)
      ? selectedValue
      : null

  const filteredTable = useMemo(
    () =>
      filterColumn
        ? filterTableByCategory(table, filterColumn.column, effectiveSelectedValue)
        : table,
    [table, filterColumn, effectiveSelectedValue],
  )

  // Re-run for real against the filtered subset on every filter change —
  // this is the "affects every piece of information shown" requirement.
  const filteredQuality = useMemo(
    () => analyzeDataQuality(filteredTable, structural.columns),
    [filteredTable, structural.columns],
  )
  const filteredNumeric = useMemo(
    () => analyzeNumericColumns(filteredTable, structural.columns),
    [filteredTable, structural.columns],
  )
  const filteredDates = useMemo(
    () => analyzeDateColumns(filteredTable, structural.columns),
    [filteredTable, structural.columns],
  )

  const kpis = useMemo(
    () =>
      computeDashboardKpis({
        filteredTable,
        totalRowsUnfiltered: structural.stats.totalRows,
        measureColumn,
        secondaryColumn: secondaryColumn?.column ?? null,
      }),
    [filteredTable, structural.stats.totalRows, measureColumn, secondaryColumn],
  )

  const notices = useMemo(
    () =>
      computeDashboardNotices({
        filteredQuality,
        filteredNumeric,
        totalRowsInView: filteredTable.numRows(),
      }),
    [filteredQuality, filteredNumeric, filteredTable],
  )

  // Adaptive: picks whichever chart types this specific dataset actually
  // supports (trend/breakdown/distribution), rather than assuming a fixed
  // "trend chart + breakdown chart" shape always applies — see
  // `chooseDashboardCharts`'s doc comment for the priority order and why.
  const charts = useMemo(
    () =>
      chooseDashboardCharts({
        table: filteredTable,
        dates: filteredDates,
        dateColumn: trendDateColumn,
        filterColumn,
        secondaryColumn,
        measureColumn,
        numeric: filteredNumeric,
      }),
    [
      filteredTable,
      filteredDates,
      trendDateColumn,
      filterColumn,
      secondaryColumn,
      measureColumn,
      filteredNumeric,
    ],
  )

  const businessInsights = useMemo(
    () => asBusinessInsights(businessInsightsSlot),
    [businessInsightsSlot],
  )
  const quickInsightItems = businessInsights?.insights.items.slice(0, 4) ?? []

  const chartTheme = {
    grid: prefersDark ? '#334155' : '#e2e8f0',
    axis: prefersDark ? '#94a3b8' : '#64748b',
    tooltipBg: prefersDark ? '#1e293b' : '#ffffff',
    tooltipBorder: prefersDark ? '#334155' : '#e2e8f0',
    tooltipText: prefersDark ? '#e2e8f0' : '#334155',
    line: prefersDark ? '#60a5fa' : '#2563eb',
  }

  return (
    <div className="flex flex-col gap-6">
      <section
        aria-labelledby="dashboard-heading"
        className="flex flex-col gap-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 dark:border-slate-800 dark:bg-slate-900"
      >
        <div>
          <h2
            id="dashboard-heading"
            className="text-lg font-semibold text-slate-900 dark:text-slate-100"
          >
            Dashboard
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            KPIs, notices, and charts computed live from this dataset. Use the
            filter below to narrow every section on this page to one segment
            at a time.
          </p>
        </div>

        {filterColumn ? (
          <div role="group" aria-label={`Filter by ${filterColumn.column}`}>
            <span className="mb-2 block text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
              Filter by {filterColumn.column}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <FilterChip
                label="All"
                isSelected={effectiveSelectedValue === null}
                onClick={() => setSelectedValue(null)}
              />
              {filterColumn.distinctValues.map((value) => (
                <FilterChip
                  key={value}
                  label={value}
                  isSelected={effectiveSelectedValue === value}
                  onClick={() => setSelectedValue(value)}
                />
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No low-cardinality categorical column was found to filter by;
            showing the full dataset.
          </p>
        )}
      </section>

      <section aria-labelledby="dashboard-kpis-heading" className="flex flex-col gap-3">
        <h3
          id="dashboard-kpis-heading"
          className="text-base font-semibold text-slate-900 dark:text-slate-100"
        >
          KPIs {effectiveSelectedValue ? `— ${filterColumn?.column} = ${effectiveSelectedValue}` : '(all rows)'}
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {kpis.map((kpi) => (
            <div
              key={kpi.id}
              className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/50"
            >
              <span className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
                {kpi.label}
              </span>
              <span className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {kpi.value}
              </span>
              <span className="text-xs text-slate-600 dark:text-slate-400">{kpi.caption}</span>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="dashboard-notices-heading" className="flex flex-col gap-3">
        <h3
          id="dashboard-notices-heading"
          className="text-base font-semibold text-slate-900 dark:text-slate-100"
        >
          Notices
        </h3>
        <ul className="flex flex-col gap-2">
          {notices.map((notice) => (
            <li
              key={notice.id}
              className={`rounded-md border px-4 py-2.5 text-sm ${SEVERITY_BADGE_STYLES[notice.severity]}`}
            >
              {notice.text}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="dashboard-charts-heading" className="flex flex-col gap-3">
        <h3
          id="dashboard-charts-heading"
          className="text-base font-semibold text-slate-900 dark:text-slate-100"
        >
          Charts
        </h3>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {charts.length > 0 ? (
            charts.map((chart) => (
              <DashboardChartCard
                key={chart.id}
                chart={chart}
                chartTheme={chartTheme}
                prefersDark={prefersDark}
              />
            ))
          ) : (
            <p className="col-span-full py-8 text-center text-sm text-slate-500 dark:text-slate-400">
              No columns in this dataset support a chart yet.
            </p>
          )}
        </div>
      </section>

      <section aria-labelledby="dashboard-quick-insights-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3
            id="dashboard-quick-insights-heading"
            className="text-base font-semibold text-slate-900 dark:text-slate-100"
          >
            Quick insights
          </h3>
          {businessInsights && (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Based on the full dataset — not affected by the filter above.
            </span>
          )}
        </div>

        {(businessInsightsSlot.status === 'pending' || businessInsightsSlot.status === 'running') && (
          <div className="flex flex-col gap-3">
            <div
              role="status"
              aria-live="polite"
              className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300"
            >
              Generating business insights...
            </div>
            <SkeletonList count={2} />
          </div>
        )}

        {businessInsightsSlot.status === 'error' && (
          <div
            role="alert"
            className="flex flex-col gap-1 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
          >
            <span>
              Couldn't generate quick insights:{' '}
              {businessInsightsSlot.errorMessage ?? 'Unknown error.'}
            </span>
            <span className="text-xs text-red-700 dark:text-red-400">
              Use "Re-run analysis" (in the sidebar) to try again.
            </span>
          </div>
        )}

        {businessInsightsSlot.status === 'done' &&
          (quickInsightItems.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {quickInsightItems.map((item) => (
                <li
                  key={item.id}
                  className="rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-900"
                >
                  <p className="font-medium text-slate-900 dark:text-slate-100">{item.title}</p>
                  <p className="mt-1 text-slate-600 dark:text-slate-400">{item.description}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No business insights available for this dataset.
            </p>
          ))}
      </section>
    </div>
  )
}

interface FilterChipProps {
  label: string
  isSelected: boolean
  onClick: () => void
}

function FilterChip({ label, isSelected, onClick }: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isSelected}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        isSelected
          ? 'border-blue-600 bg-blue-600 text-white dark:border-blue-500 dark:bg-blue-500'
          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
      }`}
    >
      {label}
    </button>
  )
}

interface ChartTheme {
  grid: string
  axis: string
  tooltipBg: string
  tooltipBorder: string
  tooltipText: string
  line: string
}

interface DashboardChartCardProps {
  chart: DashboardChartSpec
  chartTheme: ChartTheme
  prefersDark: boolean
}

/**
 * Renders one adaptively-chosen chart (`chooseDashboardCharts`,
 * `dashboardMetrics.ts`) as either a monthly trend line or a category bar
 * chart, based on `chart.kind` — the two shapes this dashboard's chart slots
 * ever need, regardless of which real columns produced the data. Card
 * chrome (border, title) is identical either way; only the Recharts
 * component and its data-key differ.
 */
function DashboardChartCard({ chart, chartTheme, prefersDark }: DashboardChartCardProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h4 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
        {chart.title}
      </h4>
      {chart.kind === 'trend' ? (
        <ResponsiveContainer width="100%" height={260}>
          <LineChart
            data={chart.data}
            margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
          >
            <CartesianGrid stroke={chartTheme.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="bucket"
              tick={{ fill: chartTheme.axis, fontSize: 12 }}
              stroke={chartTheme.axis}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fill: chartTheme.axis, fontSize: 12 }}
              stroke={chartTheme.axis}
            />
            <Tooltip
              contentStyle={{
                background: chartTheme.tooltipBg,
                border: `1px solid ${chartTheme.tooltipBorder}`,
                borderRadius: 8,
                color: chartTheme.tooltipText,
                fontSize: 13,
              }}
              labelStyle={{ color: chartTheme.tooltipText }}
              formatter={(value) => [value ?? 0, chart.valueLabel]}
            />
            <Line
              type="monotone"
              dataKey="count"
              name={chart.valueLabel}
              stroke={chartTheme.line}
              strokeWidth={2}
              dot={{ r: 3, fill: chartTheme.line }}
            />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <BarChart
            data={chart.data}
            margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
          >
            <CartesianGrid stroke={chartTheme.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fill: chartTheme.axis, fontSize: 11 }}
              stroke={chartTheme.axis}
              interval={0}
              angle={chart.data.length > 4 ? -20 : 0}
              textAnchor={chart.data.length > 4 ? 'end' : 'middle'}
              height={chart.data.length > 4 ? 50 : 30}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fill: chartTheme.axis, fontSize: 12 }}
              stroke={chartTheme.axis}
            />
            <Tooltip
              contentStyle={{
                background: chartTheme.tooltipBg,
                border: `1px solid ${chartTheme.tooltipBorder}`,
                borderRadius: 8,
                color: chartTheme.tooltipText,
                fontSize: 13,
              }}
              labelStyle={{ color: chartTheme.tooltipText }}
              formatter={(value) => [value ?? 0, chart.valueLabel]}
            />
            <Bar dataKey="count" name={chart.valueLabel} radius={[4, 4, 0, 0]}>
              {chart.data.map((entry, index) => (
                <Cell
                  key={entry.name}
                  fill={
                    entry.name === 'Other'
                      ? CATEGORY_COLORS[CATEGORY_COLORS.length - 1][prefersDark ? 'dark' : 'light']
                      : CATEGORY_COLORS[index % (CATEGORY_COLORS.length - 1)][
                          prefersDark ? 'dark' : 'light'
                        ]
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
