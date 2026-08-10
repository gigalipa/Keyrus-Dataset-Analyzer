import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, XAxis, YAxis } from 'recharts'
import type { DashboardChartSpec } from '../../lib/dashboard/dashboardMetrics'

/**
 * Fixed pixel dimensions the PDF report's chart images are rendered at
 * (Milestone 11.1) — deliberately *not* `ResponsiveContainer` (which
 * `DashboardChartCard` uses for the live dashboard): `ResponsiveContainer`
 * measures its parent via `ResizeObserver`, which is unreliable for an
 * element rendered off-screen purely for `html2canvas` capture. A fixed
 * `width`/`height` on `LineChart`/`BarChart` directly draws real SVG
 * synchronously, with no observer round-trip to wait out.
 */
export const OFFSCREEN_CHART_WIDTH = 640
export const OFFSCREEN_CHART_HEIGHT = 300

/** Same fixed light-mode palette `DashboardChartCard` uses — the PDF report always renders in light colors regardless of the viewer's OS theme, since it's a printed/downloaded document, not a themed UI surface. */
const CHART_THEME = {
  grid: '#e2e8f0',
  axis: '#64748b',
  line: '#2563eb',
}

const CATEGORY_COLORS = [
  '#2563eb',
  '#d97706',
  '#059669',
  '#7c3aed',
  '#e11d48',
  '#0891b2',
  '#64748b', // "Other"
]

interface OffscreenChartProps {
  chart: DashboardChartSpec
}

/**
 * Renders one `DashboardChartSpec` as a fixed-size, light-themed Recharts
 * SVG — used exclusively by `captureChartImages.tsx` as the off-screen
 * source `html2canvas` screenshots into a PNG for the PDF report. Not used
 * by the live Dashboard UI (see `DashboardChartCard` for that).
 */
export function OffscreenChart({ chart }: OffscreenChartProps) {
  if (chart.kind === 'trend') {
    return (
      <LineChart
        width={OFFSCREEN_CHART_WIDTH}
        height={OFFSCREEN_CHART_HEIGHT}
        data={chart.data}
        margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
      >
        <CartesianGrid stroke={CHART_THEME.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="bucket" tick={{ fill: CHART_THEME.axis, fontSize: 12 }} stroke={CHART_THEME.axis} />
        <YAxis allowDecimals={false} tick={{ fill: CHART_THEME.axis, fontSize: 12 }} stroke={CHART_THEME.axis} />
        <Line
          type="monotone"
          dataKey="count"
          name={chart.valueLabel}
          stroke={CHART_THEME.line}
          strokeWidth={2}
          dot={{ r: 3, fill: CHART_THEME.line }}
          isAnimationActive={false}
        />
      </LineChart>
    )
  }

  return (
    <BarChart
      width={OFFSCREEN_CHART_WIDTH}
      height={OFFSCREEN_CHART_HEIGHT}
      data={chart.data}
      margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
    >
      <CartesianGrid stroke={CHART_THEME.grid} strokeDasharray="3 3" vertical={false} />
      <XAxis
        dataKey="name"
        tick={{ fill: CHART_THEME.axis, fontSize: 11 }}
        stroke={CHART_THEME.axis}
        interval={0}
        angle={chart.data.length > 4 ? -20 : 0}
        textAnchor={chart.data.length > 4 ? 'end' : 'middle'}
        height={chart.data.length > 4 ? 50 : 30}
      />
      <YAxis allowDecimals={false} tick={{ fill: CHART_THEME.axis, fontSize: 12 }} stroke={CHART_THEME.axis} />
      <Bar dataKey="count" name={chart.valueLabel} radius={[4, 4, 0, 0]} isAnimationActive={false}>
        {chart.data.map((entry, index) => (
          <Cell
            key={entry.name}
            fill={
              entry.name === 'Other'
                ? CATEGORY_COLORS[CATEGORY_COLORS.length - 1]
                : CATEGORY_COLORS[index % (CATEGORY_COLORS.length - 1)]
            }
          />
        ))}
      </Bar>
    </BarChart>
  )
}
