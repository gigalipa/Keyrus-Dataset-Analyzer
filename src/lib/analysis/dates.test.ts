/**
 * Regression test — Phase 7 bug fix. An ID-like string column (e.g.
 * "ORD-50276") was being misclassified as a date column: `parseFallbackDate`
 * accepted any string containing a letter and handed it to `Date.parse`,
 * which happily (and wrongly) interpreted the trailing digits as a year.
 * Real date strings (ISO, numeric, and free-form month-name forms) must
 * still all detect correctly.
 */
import { describe, expect, it } from 'vitest'
import * as aq from 'arquero'
import { analyzeDateColumns } from './dates'
import type { ColumnMetadata } from './structural'

function columnMeta(name: string): ColumnMetadata {
  return { name, index: 0, dataType: 'string', sampleValues: [] }
}

describe('analyzeDateColumns', () => {
  it('does not classify an order-id-style string column as a date column', () => {
    const table = aq.table({
      order_id: ['ORD-50276', 'ORD-50647', 'ORD-50062', 'ORD-50660', 'ORD-50661'],
    })
    const result = analyzeDateColumns(table, [columnMeta('order_id')])
    expect(result.find((r) => r.column === 'order_id')).toBeUndefined()
  })

  it('still detects a real ISO date column', () => {
    const table = aq.table({
      created_at: ['2024-01-05', '2024-02-10', '2024-03-15'],
    })
    const result = analyzeDateColumns(table, [columnMeta('created_at')])
    const col = result.find((r) => r.column === 'created_at')
    expect(col).toBeDefined()
    expect(col?.minDate).toBe('2024-01-05')
    expect(col?.maxDate).toBe('2024-03-15')
  })

  it('still detects a free-form month-name date column', () => {
    const table = aq.table({
      signed_on: ['January 5, 2024', 'February 10, 2024', 'March 15, 2024'],
    })
    const result = analyzeDateColumns(table, [columnMeta('signed_on')])
    const col = result.find((r) => r.column === 'signed_on')
    expect(col).toBeDefined()
    expect(col?.detectedFormats).toContain('Other')
  })

  it('does not classify a mixed alphanumeric SKU column as a date column', () => {
    const table = aq.table({
      sku: ['SKU-99201', 'SKU-10442', 'SKU-77310', 'SKU-88123'],
    })
    const result = analyzeDateColumns(table, [columnMeta('sku')])
    expect(result.find((r) => r.column === 'sku')).toBeUndefined()
  })
})
