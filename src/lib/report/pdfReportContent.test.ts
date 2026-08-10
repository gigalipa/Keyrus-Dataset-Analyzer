/**
 * Unit coverage for `gatherPdfReportContent` (Phase 11, Milestone 11.1) —
 * the pure, DOM-free content-assembly step for the PDF report. Builds a real
 * small dataset through the actual Phase 3 analysis functions (same pattern
 * `runPipeline.test.ts` uses) rather than hand-rolled fixtures, so the
 * dashboard-content assembly is exercised against genuine
 * `StructuralAnalysis`/`DataQualityReport`/`NumericColumnAnalysis[]` shapes.
 */
import { describe, expect, it } from 'vitest'
import * as aq from 'arquero'
import { analyzeStructure } from '../analysis/structural'
import { analyzeNumericColumns } from '../analysis/numeric'
import { analyzeDataQuality } from '../analysis/quality'
import { analyzeDateColumns } from '../analysis/dates'
import type { AnalysisResult } from '../../types/upload'
import {
  createPendingLlmOutputs,
  pendingStepSlot,
  type PersistedDataset,
} from '../../types/persistedDataset'
import type { InsightGroup } from '../llm/schema'
import type { BusinessInsightsResult } from '../llm/businessInsights'
import type { AuditTrail } from '../etl/applyCleaningPlan'
import { gatherPdfReportContent, pdfReportFileName } from './pdfReportContent'

function makeFile(name: string, sizeBytes = 2048): File {
  return new File([new Uint8Array(sizeBytes)], name)
}

function makeAnalysis(): AnalysisResult {
  const table = aq.table({
    region: ['East', 'West', 'East', 'West', 'East', 'North', 'East', 'West'],
    revenue: [100, 50, 200, 25, 300, 10, null, 40],
    order_date: [
      '2024-01-05',
      '2024-01-15',
      '2024-02-01',
      '2024-02-20',
      '2024-03-01',
      '2024-03-15',
      '2024-03-20',
      '2024-04-01',
    ],
  })
  const file = makeFile('orders.csv')
  const structural = analyzeStructure(table, file)
  const numeric = analyzeNumericColumns(table, structural.columns)
  const quality = analyzeDataQuality(table, structural.columns)
  const dates = analyzeDateColumns(table, structural.columns)

  return {
    table,
    meta: { headers: structural.columns.map((c) => c.name), rows: table.objects() as Record<string, unknown>[], sourceFormat: 'csv' } as unknown as AnalysisResult['meta'],
    structural,
    numeric,
    quality,
    dates,
    uploadedAt: Date.now(),
  }
}

function makeGroup(type: InsightGroup['type'], count = 2): InsightGroup {
  return {
    type,
    label: type,
    minItems: 1,
    items: Array.from({ length: count }, (_, i) => ({
      id: `${type}-${i}`,
      type,
      title: `${type} title ${i}`,
      description: `${type} description ${i}`,
      tags: ['tag-a'],
      priority: 'medium' as const,
    })),
  }
}

describe('gatherPdfReportContent', () => {
  it('assembles overview, dashboard, and quality content from real analysis output', () => {
    const analysis = makeAnalysis()
    const file = makeFile('orders.csv')
    const llmOutputs = createPendingLlmOutputs()

    const content = gatherPdfReportContent(analysis, file, llmOutputs)

    expect(content.fileName).toBe('orders.csv')
    expect(content.overview.rows).toBe(8)
    expect(content.overview.columns).toBe(3)

    // Dashboard: KPIs/notices/charts come from the real dashboardMetrics
    // functions run against the unfiltered table.
    expect(content.dashboard.kpis.length).toBeGreaterThan(0)
    expect(content.dashboard.kpis[0].label).toBe('Rows in view')
    expect(content.dashboard.kpis[0].value).toBe('8')
    // A trend chart should exist (real date column with valid values).
    expect(content.dashboard.charts.some((c) => c.kind === 'trend')).toBe(true)

    // Quality: one missing revenue value.
    expect(content.quality.totalMissing).toBe(1)
    expect(content.quality.missingRows.some((r) => r.column === 'revenue')).toBe(true)
  })

  it('reports LLM sections as null ("not generated") when their slots are still pending', () => {
    const analysis = makeAnalysis()
    const file = makeFile('orders.csv')
    const llmOutputs = createPendingLlmOutputs()

    const content = gatherPdfReportContent(analysis, file, llmOutputs)

    expect(content.explanation).toBeNull()
    expect(content.businessInsights).toBeNull()
    expect(content.clientQuestions).toBeNull()
    expect(content.dataDictionary).toBeNull()
  })

  it('decodes done LLM slots into their display shapes', () => {
    const analysis = makeAnalysis()
    const file = makeFile('orders.csv')
    const businessInsights: BusinessInsightsResult = {
      kpis: makeGroup('kpi'),
      insights: makeGroup('insight'),
      recommendations: makeGroup('recommendation'),
    }
    const llmOutputs: PersistedDataset['llmOutputs'] = {
      dataDictionary: { status: 'done', data: makeGroup('dictionaryEntry') },
      businessInsights: {
        status: 'done',
        data: [businessInsights.kpis, businessInsights.insights, businessInsights.recommendations],
      },
      explanation: { status: 'done', data: makeGroup('explanation', 1) },
      clientQuestions: { status: 'done', data: makeGroup('question', 3) },
    }

    const content = gatherPdfReportContent(analysis, file, llmOutputs)

    expect(content.dataDictionary?.items).toHaveLength(2)
    expect(content.businessInsights?.kpis.items).toHaveLength(2)
    expect(content.explanation?.title).toBe('explanation title 0')
    expect(content.clientQuestions).toHaveLength(3)
  })

  it('summarizes the cleaning audit trail by change type when the slot is done', () => {
    const analysis = makeAnalysis()
    const file = makeFile('orders.csv')
    const llmOutputs = createPendingLlmOutputs()
    const auditTrail: AuditTrail = {
      entries: [
        {
          columnName: 'region',
          changeType: 'value-mapping',
          description: 'Unified casing variants.',
          reason: 'Casing variant.',
          applied: true,
          affectedRows: 3,
        },
        {
          columnName: 'region',
          changeType: 'value-mapping',
          description: 'Unified another variant.',
          reason: 'Casing variant.',
          applied: true,
          affectedRows: 2,
        },
        {
          columnName: 'revenue',
          changeType: 'missing-value-policy',
          description: 'Left missing values as-is.',
          reason: 'No safe default.',
          applied: false,
          affectedRows: 1,
        },
      ],
    }
    const cleaningSlot: PersistedDataset['cleaning'] = { status: 'done', data: auditTrail }

    const content = gatherPdfReportContent(analysis, file, llmOutputs, cleaningSlot)

    expect(content.cleaningSummary).not.toBeNull()
    const valueMapping = content.cleaningSummary?.find((r) => r.changeType === 'value-mapping')
    expect(valueMapping?.count).toBe(2)
    expect(valueMapping?.affectedRows).toBe(5)
    const missingPolicy = content.cleaningSummary?.find((r) => r.changeType === 'missing-value-policy')
    // Not applied, so affectedRows should not count the 1 row.
    expect(missingPolicy?.affectedRows).toBe(0)
  })

  it('reports cleaningSummary as null when the cleaning slot has not finished', () => {
    const analysis = makeAnalysis()
    const file = makeFile('orders.csv')
    const llmOutputs = createPendingLlmOutputs()

    const content = gatherPdfReportContent(analysis, file, llmOutputs, pendingStepSlot())

    expect(content.cleaningSummary).toBeNull()
  })
})

describe('pdfReportFileName', () => {
  it('derives a -report.pdf name from the original file name', () => {
    expect(pdfReportFileName('orders.csv')).toBe('orders-report.pdf')
    expect(pdfReportFileName('My Orders.xlsx')).toBe('My Orders-report.pdf')
  })

  it('falls back to "dataset" for a name with no usable base', () => {
    expect(pdfReportFileName('.csv')).toBe('dataset-report.pdf')
  })
})
