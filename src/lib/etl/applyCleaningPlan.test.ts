/**
 * Tests for the Milestone 10.2 ETL cleaning engine. Follows
 * `src/lib/analysis/dates.test.ts`'s style: `aq.table({...})` (column-
 * oriented object of arrays), NOT `aq.from()`, which produces a 1-row table
 * on an object-of-arrays input.
 */
import { describe, expect, it } from 'vitest'
import * as aq from 'arquero'
import { applyCleaningPlan } from './applyCleaningPlan'
import type { CleaningPlan } from '../llm/cleaningPlan'

function planFor(
  columnName: string,
  overrides: Partial<CleaningPlan['columns'][number]>,
): CleaningPlan {
  return {
    columns: [
      {
        columnName,
        valueMappings: [],
        missingValuePolicy: null,
        typeCoercion: null,
        ...overrides,
      },
    ],
  }
}

describe('applyCleaningPlan', () => {
  it('unifies casing variants via value mappings and logs the affected-row count', () => {
    const table = aq.table({
      channel: ['web', 'WEB', 'Web', 'store'],
    })
    const plan = planFor('channel', {
      valueMappings: [
        { from: 'web', to: 'Web', reason: 'Unify casing variants of Web.' },
        { from: 'WEB', to: 'Web', reason: 'Unify casing variants of Web.' },
      ],
    })

    const { cleanedTable, auditTrail } = applyCleaningPlan(table, plan)

    expect(cleanedTable.array('channel')).toEqual([
      'Web',
      'Web',
      'Web',
      'store',
    ])

    const webEntry = auditTrail.entries.find(
      (e) => e.changeType === 'value-mapping' && e.description.includes('"web"'),
    )
    expect(webEntry).toMatchObject({
      columnName: 'channel',
      reason: 'Unify casing variants of Web.',
      affectedRows: 1,
      applied: true,
    })

    const WEBEntry = auditTrail.entries.find(
      (e) => e.changeType === 'value-mapping' && e.description.includes('"WEB"'),
    )
    expect(WEBEntry).toMatchObject({ affectedRows: 1, applied: true })
  })

  it('drop-row removes exactly the rows missing that column', () => {
    const table = aq.table({
      id: [1, 2, 3, 4],
      email: ['a@x.com', '', 'c@x.com', null],
    })
    const plan = planFor('email', {
      missingValuePolicy: {
        action: 'drop-row',
        reason: 'Email is required for outreach.',
      },
    })

    const { cleanedTable, auditTrail } = applyCleaningPlan(table, plan)

    expect(cleanedTable.numRows()).toBe(2)
    expect(cleanedTable.array('id')).toEqual([1, 3])

    const entry = auditTrail.entries.find(
      (e) => e.changeType === 'missing-value-policy',
    )
    expect(entry).toMatchObject({
      columnName: 'email',
      reason: 'Email is required for outreach.',
      affectedRows: 2,
      applied: true,
    })
  })

  it('fill-default fills missing values with the stated default', () => {
    const table = aq.table({
      country: ['US', '', 'CA', null],
    })
    const plan = planFor('country', {
      missingValuePolicy: {
        action: 'fill-default',
        defaultValue: 'Unknown',
        reason: 'Country is optional; default to Unknown.',
      },
    })

    const { cleanedTable, auditTrail } = applyCleaningPlan(table, plan)

    expect(cleanedTable.array('country')).toEqual([
      'US',
      'Unknown',
      'CA',
      'Unknown',
    ])

    const entry = auditTrail.entries.find(
      (e) => e.changeType === 'missing-value-policy',
    )
    expect(entry).toMatchObject({
      reason: 'Country is optional; default to Unknown.',
      affectedRows: 2,
      applied: true,
    })
  })

  it('leave-null is a no-op but still produces a logged audit entry', () => {
    const table = aq.table({
      middle_name: ['A', '', 'B', null],
    })
    const plan = planFor('middle_name', {
      missingValuePolicy: {
        action: 'leave-null',
        reason: 'Middle name is genuinely optional.',
      },
    })

    const { cleanedTable, auditTrail } = applyCleaningPlan(table, plan)

    expect(cleanedTable.numRows()).toBe(4)
    expect(cleanedTable.array('middle_name')).toEqual(['A', '', 'B', null])

    const entry = auditTrail.entries.find(
      (e) => e.changeType === 'missing-value-policy',
    )
    expect(entry).toMatchObject({
      reason: 'Middle name is genuinely optional.',
      affectedRows: 0,
      applied: false,
    })
  })

  describe('type coercion', () => {
    it('coerces to integer', () => {
      const table = aq.table({ qty: ['3', '10', '7'] })
      const plan = planFor('qty', {
        typeCoercion: { targetType: 'integer', reason: 'Quantity should be numeric.' },
      })
      const { cleanedTable, auditTrail } = applyCleaningPlan(table, plan)
      expect(cleanedTable.array('qty')).toEqual([3, 10, 7])
      expect(
        auditTrail.entries.find((e) => e.changeType === 'type-coercion'),
      ).toMatchObject({ affectedRows: 3, applied: true })
    })

    it('coerces to float', () => {
      const table = aq.table({ price: ['3.5', '10.25'] })
      const plan = planFor('price', {
        typeCoercion: { targetType: 'float', reason: 'Price is decimal.' },
      })
      const { cleanedTable } = applyCleaningPlan(table, plan)
      expect(cleanedTable.array('price')).toEqual([3.5, 10.25])
    })

    it('coerces to number', () => {
      const table = aq.table({ price: ['3.5', '10'] })
      const plan = planFor('price', {
        typeCoercion: { targetType: 'number', reason: 'Generic numeric.' },
      })
      const { cleanedTable } = applyCleaningPlan(table, plan)
      expect(cleanedTable.array('price')).toEqual([3.5, 10])
    })

    it('coerces to string', () => {
      const table = aq.table({ code: [1, 2, 3] })
      const plan = planFor('code', {
        typeCoercion: { targetType: 'string', reason: 'Codes are identifiers, not numbers.' },
      })
      const { cleanedTable } = applyCleaningPlan(table, plan)
      expect(cleanedTable.array('code')).toEqual(['1', '2', '3'])
    })

    it('coerces to boolean', () => {
      const table = aq.table({ active: ['yes', 'no', 'true', 'false'] })
      const plan = planFor('active', {
        typeCoercion: { targetType: 'boolean', reason: 'Active is a flag.' },
      })
      const { cleanedTable } = applyCleaningPlan(table, plan)
      expect(cleanedTable.array('active')).toEqual([true, false, true, false])
    })

    it('coerces to date (YYYY-MM-DD)', () => {
      const table = aq.table({ signed_on: ['01/05/2024', '2024-02-10'] })
      const plan = planFor('signed_on', {
        typeCoercion: { targetType: 'date', reason: 'Mixed date formats.' },
      })
      const { cleanedTable } = applyCleaningPlan(table, plan)
      expect(cleanedTable.array('signed_on')).toEqual([
        '2024-01-05',
        '2024-02-10',
      ])
    })

    it('does not crash on unparseable input and logs the coercion failure', () => {
      const table = aq.table({ qty: ['3', 'abc', '7'] })
      const plan = planFor('qty', {
        typeCoercion: { targetType: 'integer', reason: 'Quantity should be numeric.' },
      })
      const { cleanedTable, auditTrail } = applyCleaningPlan(table, plan)

      expect(cleanedTable.array('qty')).toEqual([3, 'abc', 7])

      const entry = auditTrail.entries.find(
        (e) => e.changeType === 'type-coercion',
      )
      expect(entry).toBeDefined()
      expect(entry!.affectedRows).toBe(2)
      expect(entry!.description).toContain('1 value(s) could not be parsed')
    })
  })

  it('skips a plan entry referencing a nonexistent column, without applying or throwing', () => {
    const table = aq.table({ id: [1, 2, 3] })
    const plan: CleaningPlan = {
      columns: [
        {
          columnName: 'does_not_exist',
          valueMappings: [
            { from: 'a', to: 'b', reason: 'Should never be applied.' },
          ],
          missingValuePolicy: null,
          typeCoercion: null,
        },
      ],
    }

    expect(() => applyCleaningPlan(table, plan)).not.toThrow()
    const { cleanedTable, auditTrail } = applyCleaningPlan(table, plan)

    expect(cleanedTable.array('id')).toEqual([1, 2, 3])
    expect(auditTrail.entries).toHaveLength(1)
    expect(auditTrail.entries[0]).toMatchObject({
      columnName: 'does_not_exist',
      changeType: 'skipped-invalid-column',
      applied: false,
      affectedRows: 0,
    })
    expect(auditTrail.entries[0].reason).toContain('does not exist')
  })

  it('applies value mappings, missing-value policy, and type coercion together for one column', () => {
    const table = aq.table({
      channel: ['web', 'WEB', '', 'store'],
    })
    const plan: CleaningPlan = {
      columns: [
        {
          columnName: 'channel',
          valueMappings: [
            { from: 'web', to: 'Web', reason: 'Unify casing.' },
            { from: 'WEB', to: 'Web', reason: 'Unify casing.' },
          ],
          missingValuePolicy: {
            action: 'fill-default',
            defaultValue: 'Unknown',
            reason: 'Default missing channel to Unknown.',
          },
          typeCoercion: null,
        },
      ],
    }

    const { cleanedTable } = applyCleaningPlan(table, plan)
    expect(cleanedTable.array('channel')).toEqual([
      'Web',
      'Web',
      'Unknown',
      'store',
    ])
  })
})
