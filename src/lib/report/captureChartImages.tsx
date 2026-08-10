/**
 * Milestone 11.1 "PDF report generation" — the one place in the report
 * pipeline that touches the DOM. Every other piece of the PDF's content is
 * plain data drawn straight into the document with jsPDF's own text/vector
 * API (`pdfReportContent.ts`, `pdfReport.ts`); Recharts renders its charts
 * as SVG, which jsPDF cannot draw directly, so this module renders each
 * chart into an off-screen host, screenshots it with `html2canvas`, and
 * hands back a PNG per chart for `pdfReport.ts` to embed via `addImage`.
 *
 * Deliberately independent of `DashboardPanel`/`MainViewport`'s mounted
 * state: `MainViewport` keeps the Dashboard section mounted at all times but
 * hidden via a `hidden` (display:none) class when it isn't the active
 * section (`KeptMounted`), and `display:none` elements have no layout box —
 * `html2canvas` cannot capture them regardless of which section the user
 * happens to have open when they click "Download PDF Report". This module
 * sidesteps that entirely by mounting its own throwaway React root into a
 * detached host `div`, positioned off-screen (`position: fixed; left:
 * -10000px`, not `display:none`/`opacity:0`) so it has a genuine, capturable
 * layout box regardless of the app's current section.
 */
import { createRoot } from 'react-dom/client'
import html2canvas from 'html2canvas'
import {
  OffscreenChart,
  OFFSCREEN_CHART_HEIGHT,
  OFFSCREEN_CHART_WIDTH,
} from '../../components/report/OffscreenChart'
import type { DashboardChartSpec } from '../dashboard/dashboardMetrics'

export interface ChartImage {
  id: string
  title: string
  /** PNG data URL, ready for `jsPDF#addImage`. */
  dataUrl: string
  /** Natural pixel dimensions of the captured canvas (before jsPDF scales it to fit the page). */
  width: number
  height: number
}

/** Waits two animation frames — enough for React to commit and the browser to paint the just-mounted SVG before `html2canvas` reads it. */
function waitForPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
}

/**
 * Renders each of `charts` off-screen and captures it as a PNG. Returns `[]`
 * without touching the DOM when `charts` is empty (a dataset that produced
 * no chartable columns). Always tears down the host node and React root
 * before resolving/rejecting, so a capture failure never leaves a stray
 * off-screen element behind.
 */
export async function captureChartImages(charts: DashboardChartSpec[]): Promise<ChartImage[]> {
  if (charts.length === 0) return []

  const host = document.createElement('div')
  host.style.position = 'fixed'
  host.style.left = '-10000px'
  host.style.top = '0'
  host.style.pointerEvents = 'none'
  host.setAttribute('aria-hidden', 'true')
  document.body.appendChild(host)

  const root = createRoot(host)
  try {
    root.render(
      <div>
        {charts.map((chart) => (
          <div
            key={chart.id}
            data-chart-id={chart.id}
            style={{
              width: OFFSCREEN_CHART_WIDTH,
              height: OFFSCREEN_CHART_HEIGHT,
              background: '#ffffff',
            }}
          >
            <OffscreenChart chart={chart} />
          </div>
        ))}
      </div>,
    )
    await waitForPaint()

    const images: ChartImage[] = []
    for (const chart of charts) {
      const node = host.querySelector<HTMLElement>(`[data-chart-id="${chart.id}"]`)
      if (!node) continue
      const canvas = await html2canvas(node, { backgroundColor: '#ffffff', scale: 2 })
      images.push({
        id: chart.id,
        title: chart.title,
        dataUrl: canvas.toDataURL('image/png'),
        width: canvas.width,
        height: canvas.height,
      })
    }
    return images
  } finally {
    root.unmount()
    document.body.removeChild(host)
  }
}
