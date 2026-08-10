/**
 * Regression coverage for the adaptive chart-selection engine — user
 * feedback (Phase 10 follow-up): a dataset with no detected date column left
 * the trend-chart slot permanently blank instead of falling back to another
 * meaningful chart. `chooseDashboardCharts` now picks from whichever chart
 * types the dataset actually supports (trend / breakdown / numeric
 * distribution), never assuming a fixed shape.
 */
import { describe, expect, it } from 'vitest'
import * as aq from 'arquero'
import {
  chooseDashboardCharts,
  computeCategoryMeasureBreakdown,
  computeNumericDistribution,
  type CategoricalCandidate,
} from './dashboardMetrics'
import type { DateColumnAnalysis } from '../analysis/dates'
import type { NumericColumnAnalysis } from '../analysis/numeric'

function categoricalCandidate(
  column: string,
  distinctValues: string[],
): CategoricalCandidate {
  return { column, distinctValues, messiness: 0 }
}

function numericAnalysis(column: string): NumericColumnAnalysis {
  return {
    column,
    min: 0,
    max: 0,
    mean: 0,
    median: 0,
    mode: 0,
    standardDeviation: 0,
    q1: 0,
    q3: 0,
    outlierBounds: { lower: 0, upper: 0 },
    outliers: [],
  }
}

describe('computeCategoryMeasureBreakdown', () => {
  it('sums the measure column per category, row-aligned by index', () => {
    const table = aq.table({
      region: ['East', 'West', 'East', 'West', 'East'],
      revenue: [100, 50, 200, 25, 300],
    })
    const result = computeCategoryMeasureBreakdown(table, 'region', 'revenue')
    const east = result.find((r) => r.name === 'East')
    const west = result.find((r) => r.name === 'West')
    expect(east?.count).toBe(600)
    expect(west?.count).toBe(75)
  })

  it('excludes rows whose measure value does not coerce to a number, without counting them as zero', () => {
    const table = aq.table({
      region: ['East', 'East', 'East'],
      revenue: [100, 'not-a-number', 50],
    })
    const result = computeCategoryMeasureBreakdown(table, 'region', 'revenue')
    expect(result).toEqual([{ name: 'East', count: 150 }])
  })

  it('groups blank/missing category values under "(missing)"', () => {
    const table = aq.table({
      region: ['East', '', null],
      revenue: [10, 20, 30],
    })
    const result = computeCategoryMeasureBreakdown(table, 'region', 'revenue')
    const missing = result.find((r) => r.name === '(missing)')
    expect(missing?.count).toBe(50)
  })
})

describe('computeNumericDistribution', () => {
  it('buckets values into equal-width bins spanning the observed range', () => {
    const table = aq.table({
      score: [0, 10, 20, 30, 40, 50, 55, 60, 90, 100],
    })
    const result = computeNumericDistribution(table, 'score')
    expect(result.length).toBeGreaterThan(1)
    const totalCount = result.reduce((sum, bucket) => sum + bucket.count, 0)
    expect(totalCount).toBe(10)
  })

  it('returns a single bucket when every value is identical', () => {
    const table = aq.table({ score: [5, 5, 5] })
    const result = computeNumericDistribution(table, 'score')
    expect(result).toEqual([{ name: '5', count: 3 }])
  })

  it('returns an empty array when the column has no coercible numeric values', () => {
    const table = aq.table({ score: ['n/a', '', null] })
    expect(computeNumericDistribution(table, 'score')).toEqual([])
  })
})

describe('chooseDashboardCharts', () => {
  const emptyDates: DateColumnAnalysis[] = []

  it('falls back to a secondary-category breakdown when no date column exists, instead of leaving a slot blank', () => {
    const table = aq.table({
      destino: ['Cartagena', 'Medellin', 'Santa Marta', 'Bogota', 'Cartagena'],
      warehouse: ['A', 'B', 'A', 'B', 'A'],
    })
    const charts = chooseDashboardCharts({
      table,
      dates: emptyDates,
      dateColumn: null, // the exact scenario reported: no date column detected
      filterColumn: categoricalCandidate('destino', [
        'Bogota',
        'Cartagena',
        'Medellin',
        'Santa Marta',
      ]),
      secondaryColumn: categoricalCandidate('warehouse', ['A', 'B']),
      measureColumn: null,
      numeric: [],
    })

    expect(charts.length).toBe(2)
    expect(charts.every((c) => c.kind !== 'trend')).toBe(true)
    expect(charts.some((c) => c.id === 'breakdown-destino')).toBe(true)
    expect(charts.some((c) => c.id === 'breakdown-warehouse')).toBe(true)
  })

  it('falls back to a numeric-distribution histogram when neither a date nor a second categorical column exists', () => {
    const table = aq.table({
      destino: ['Cartagena', 'Medellin', 'Santa Marta', 'Bogota'],
      weight_kg: [12.5, 30.2, 8.1, 45.0],
    })
    const charts = chooseDashboardCharts({
      table,
      dates: emptyDates,
      dateColumn: null,
      filterColumn: categoricalCandidate('destino', [
        'Bogota',
        'Cartagena',
        'Medellin',
        'Santa Marta',
      ]),
      secondaryColumn: null,
      measureColumn: null,
      numeric: [numericAnalysis('weight_kg')],
    })

    expect(charts.length).toBe(2)
    expect(charts.some((c) => c.id === 'distribution-weight_kg')).toBe(true)
  })

  it('still produces the trend + breakdown pair when a date column is available (no regression for the common case)', () => {
    const table = aq.table({
      chnl: ['Web', 'Store', 'Web'],
    })
    const dates: DateColumnAnalysis[] = [
      {
        column: 'order_dt',
        detectedFormats: ['ISO-8601'],
        minDate: '2024-01-01',
        maxDate: '2024-03-01',
        durationDays: 60,
        flaggedDates: [],
        normalizedValues: ['2024-01-15', '2024-02-15', '2024-03-15'],
      },
    ]
    const charts = chooseDashboardCharts({
      table,
      dates,
      dateColumn: 'order_dt',
      filterColumn: categoricalCandidate('chnl', ['Store', 'Web']),
      secondaryColumn: null,
      measureColumn: null,
      numeric: [],
    })

    expect(charts.map((c) => c.kind)).toEqual(['trend', 'bar'])
  })

  it('returns an empty array, not a crash, when nothing chartable is available', () => {
    const table = aq.table({ notes: ['free text only'] })
    const charts = chooseDashboardCharts({
      table,
      dates: emptyDates,
      dateColumn: null,
      filterColumn: null,
      secondaryColumn: null,
      measureColumn: null,
      numeric: [],
    })
    expect(charts).toEqual([])
  })
})
