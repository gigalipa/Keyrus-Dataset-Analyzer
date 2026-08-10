/**
 * Unit tests for the Phase 10, Milestone 10.1 cleaning-plan schema —
 * `parseCleaningPlan`/`cleaningPlanSchema` (`cleaningPlan.ts`). Pure
 * validation logic, no network calls, mirroring `dates.test.ts`'s
 * fixture-driven style for this codebase's analysis/schema modules.
 */
import { describe, expect, it } from 'vitest'
import {
  CleaningPlanValidationError,
  parseCleaningPlan,
} from './cleaningPlan'

describe('parseCleaningPlan', () => {
  it('accepts a valid plan with all three kinds of column entries', () => {
    const raw = {
      columns: [
        {
          columnName: 'chnl',
          valueMappings: [
            { from: 'web', to: 'Web', reason: 'Casing variant of "Web".' },
            { from: 'WEB', to: 'Web', reason: 'Casing variant of "Web".' },
          ],
          missingValuePolicy: null,
          typeCoercion: null,
        },
        {
          columnName: 'csat_score',
          valueMappings: [],
          missingValuePolicy: {
            action: 'leave-null',
            reason: 'CSAT is only collected when a customer responds; absence is meaningful, not an error.',
          },
          typeCoercion: {
            targetType: 'integer',
            reason: 'Scores are whole numbers 1-5 but were read as strings.',
          },
        },
        {
          columnName: 'cust_seg_cd',
          valueMappings: [],
          missingValuePolicy: {
            action: 'fill-default',
            defaultValue: 'UNKNOWN',
            reason: 'Segment code is missing for some rows; a sentinel keeps rows usable without guessing a segment.',
          },
          typeCoercion: null,
        },
      ],
      summary: 'Unify channel casing and address missing segment/CSAT values.',
    }

    const plan = parseCleaningPlan(raw)
    expect(plan.columns).toHaveLength(3)
    expect(plan.columns[0].valueMappings).toHaveLength(2)
    expect(plan.columns[1].missingValuePolicy).toEqual({
      action: 'leave-null',
      reason: expect.any(String),
    })
    expect(plan.columns[2].missingValuePolicy).toMatchObject({
      action: 'fill-default',
      defaultValue: 'UNKNOWN',
    })
  })

  it('rejects a column entry with no reason on a value mapping', () => {
    const raw = {
      columns: [
        {
          columnName: 'chnl',
          valueMappings: [{ from: 'web', to: 'Web', reason: '' }],
        },
      ],
    }
    expect(() => parseCleaningPlan(raw)).toThrow(CleaningPlanValidationError)
  })

  it('rejects a missing-value policy missing its reason', () => {
    const raw = {
      columns: [
        {
          columnName: 'cust_seg_cd',
          missingValuePolicy: { action: 'drop-row' },
        },
      ],
    }
    expect(() => parseCleaningPlan(raw)).toThrow(CleaningPlanValidationError)
  })

  it('rejects a column entry with no actions at all', () => {
    const raw = {
      columns: [{ columnName: 'order_id' }],
    }
    expect(() => parseCleaningPlan(raw)).toThrow(CleaningPlanValidationError)
  })

  it('rejects an unknown missing-value action', () => {
    const raw = {
      columns: [
        {
          columnName: 'chnl',
          missingValuePolicy: { action: 'do-something-else', reason: 'x' },
        },
      ],
    }
    expect(() => parseCleaningPlan(raw)).toThrow(CleaningPlanValidationError)
  })

  it('rejects a non-object payload', () => {
    expect(() => parseCleaningPlan('not a plan')).toThrow(
      CleaningPlanValidationError,
    )
  })

  it('defaults valueMappings to an empty array and null policies/coercion when omitted', () => {
    const raw = {
      columns: [
        {
          columnName: 'order_dt',
          typeCoercion: { targetType: 'date', reason: 'Stored as mixed-format text.' },
        },
      ],
    }
    const plan = parseCleaningPlan(raw)
    expect(plan.columns[0].valueMappings).toEqual([])
    expect(plan.columns[0].missingValuePolicy).toBeNull()
  })
})
