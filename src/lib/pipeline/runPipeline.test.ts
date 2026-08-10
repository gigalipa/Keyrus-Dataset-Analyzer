/**
 * Resume-on-reload verification for `runPipeline.ts` — Phase 10, Milestone
 * 10.3. `applyCleaningPlan`/`analyzeNumericColumns`/`analyzeDataQuality`/
 * `analyzeDateColumns` are pure/deterministic and run for real (fast, no
 * network); the four steps that call an LLM (`understandAndPlan`,
 * `businessInsights`, `explanation`, `clientQuestions`) are mocked out —
 * this repo's convention is real-API Playwright e2e for network behavior,
 * not vitest — so this file can assert something Playwright reload-testing
 * can't easily prove without extreme flakiness: that at every one of the
 * pipeline's new stages, `runPipeline` skips exactly the steps already
 * `'done'` and re-derives nothing it doesn't have to.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import * as aq from 'arquero'
import { runPipeline, type PipelineStepUpdate } from './runPipeline'
import { pendingStepSlot, type StepSlot } from '../../types/persistedDataset'
import type { StructuralAnalysis } from '../analysis/structural'
import type { InsightGroup } from '../llm/schema'
import type { CleaningPlan } from '../llm/cleaningPlan'
import type { BusinessInsightsResult } from '../llm/businessInsights'

const understandAndPlanMock = vi.fn()
const generateBusinessInsightsMock = vi.fn()
const generateExplanationMock = vi.fn()
const generateClientQuestionsMock = vi.fn()

vi.mock('./understandAndPlan', () => ({
  runUnderstandAndPlan: (...args: unknown[]) => understandAndPlanMock(...args),
}))
vi.mock('../llm/businessInsights', () => ({
  generateBusinessInsights: (...args: unknown[]) => generateBusinessInsightsMock(...args),
}))
vi.mock('../llm/explanation', () => ({
  generateExplanation: (...args: unknown[]) => generateExplanationMock(...args),
}))
vi.mock('../llm/clientQuestions', () => ({
  generateClientQuestions: (...args: unknown[]) => generateClientQuestionsMock(...args),
}))

function makeGroup(type: InsightGroup['type']): InsightGroup {
  return {
    type,
    label: type,
    minItems: 1,
    items: [{ id: `${type}-1`, type, title: 't', description: 'd', tags: [] }],
  }
}

const DICTIONARY = makeGroup('dictionaryEntry')
const EXPLANATION = makeGroup('explanation')
const QUESTIONS = makeGroup('question')
const PLAN: CleaningPlan = {
  columns: [
    {
      columnName: 'chnl',
      valueMappings: [{ from: 'web', to: 'Web', reason: 'Casing variant.' }],
      missingValuePolicy: null,
      typeCoercion: null,
    },
  ],
}
const BUSINESS_INSIGHTS: BusinessInsightsResult = {
  kpis: makeGroup('kpi'),
  insights: makeGroup('insight'),
  recommendations: makeGroup('recommendation'),
}

function makeRawTable() {
  return aq.table({
    chnl: ['web', 'WEB', 'store', 'web'],
    revenue: [10, 20, 30, 40],
  })
}

function makeStructural(): StructuralAnalysis {
  return {
    columns: [
      { name: 'chnl', index: 0, dataType: 'string', sampleValues: ['web', 'WEB'] },
      { name: 'revenue', index: 1, dataType: 'number', sampleValues: [10, 20] },
    ],
    stats: { totalRows: 4, totalColumns: 2, fileSizeMB: 0.001 },
  }
}

function makeFile(): File {
  return new File(['a,b\n1,2'], 'fixture.csv', { type: 'text/csv' })
}

function pending<T>(): StepSlot<T> {
  return pendingStepSlot<T>()
}

function done<T>(data: T): StepSlot<T> {
  return { status: 'done', data }
}

describe('runPipeline resume behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    understandAndPlanMock.mockResolvedValue({ dictionary: DICTIONARY, cleaningPlan: PLAN })
    generateBusinessInsightsMock.mockResolvedValue(BUSINESS_INSIGHTS)
    generateExplanationMock.mockResolvedValue(EXPLANATION)
    generateClientQuestionsMock.mockResolvedValue(QUESTIONS)
  })

  it('fresh run: executes every step in order exactly once', async () => {
    const updates: PipelineStepUpdate[] = []
    await runPipeline({
      rawTable: makeRawTable(),
      file: makeFile(),
      structural: makeStructural(),
      llmOutputs: {
        dataDictionary: pending(),
        businessInsights: pending(),
        explanation: pending(),
        clientQuestions: pending(),
      },
      cleaningPlan: pending<CleaningPlan>(),
      cleaning: pending(),
      eda: pending(),
      cleanedTable: makeRawTable(),
      analysis: { numeric: [], quality: emptyQuality(), dates: [] },
      onStepUpdate: (u) => updates.push(u),
    })

    expect(understandAndPlanMock).toHaveBeenCalledTimes(1)
    expect(generateBusinessInsightsMock).toHaveBeenCalledTimes(1)
    expect(generateExplanationMock).toHaveBeenCalledTimes(1)
    expect(generateClientQuestionsMock).toHaveBeenCalledTimes(1)

    const doneSteps = updates.filter((u) => u.slot.status === 'done').map((u) => u.step)
    expect(doneSteps).toEqual([
      'dataDictionary',
      'planCleaning',
      'clean',
      'eda',
      'businessInsights',
      'explanation',
      'clientQuestions',
    ])

    // `clean` really did something real: "web" unified to "Web" (the plan
    // only maps the lowercase variant — "WEB" is left as-is, proving this
    // is a genuine plan-driven exact-match replace, not a case-fold).
    const cleanUpdate = updates.find((u) => u.step === 'clean' && u.slot.status === 'done')
    expect(cleanUpdate?.cleanedTable?.array('chnl')).toEqual(['Web', 'WEB', 'store', 'Web'])

    // `eda` computed a real result against the cleaned table.
    const edaUpdate = updates.find((u) => u.step === 'eda' && u.slot.status === 'done')
    expect(edaUpdate?.eda?.numeric).toHaveLength(1)
    expect(edaUpdate?.eda?.numeric[0].column).toBe('revenue')

    // clientQuestions was called with the CLEANED quality report (post-clean
    // EDA), not a fresh/raw one — the entire point of this phase.
    expect(generateClientQuestionsMock).toHaveBeenCalledWith(
      expect.anything(),
      edaUpdate?.eda?.quality,
      expect.anything(),
    )
  })

  it('resumes correctly when interrupted before cleaning (dictionary/plan already done)', async () => {
    const updates: PipelineStepUpdate[] = []
    await runPipeline({
      rawTable: makeRawTable(),
      file: makeFile(),
      structural: makeStructural(),
      llmOutputs: {
        dataDictionary: done(DICTIONARY),
        businessInsights: pending(),
        explanation: pending(),
        clientQuestions: pending(),
      },
      cleaningPlan: done(PLAN),
      cleaning: pending(),
      eda: pending(),
      // cleaning not done yet, so cleanedTable == rawTable, per the real
      // caller's invariant (useDatasetSession.ts).
      cleanedTable: makeRawTable(),
      analysis: { numeric: [], quality: emptyQuality(), dates: [] },
      onStepUpdate: (u) => updates.push(u),
    })

    // The concurrent dictionary+plan call must NOT re-run.
    expect(understandAndPlanMock).not.toHaveBeenCalled()
    const steps = updates.map((u) => u.step)
    expect(steps).not.toContain('dataDictionary')
    expect(steps).not.toContain('planCleaning')
    // But clean/eda/business/explanation/questions all still run.
    expect(steps).toEqual([
      'clean',
      'clean',
      'eda',
      'eda',
      'businessInsights',
      'businessInsights',
      'explanation',
      'explanation',
      'clientQuestions',
      'clientQuestions',
    ])
  })

  it('resumes correctly when interrupted after cleaning but before EDA', async () => {
    const updates: PipelineStepUpdate[] = []
    const alreadyCleaned = aq.table({ chnl: ['Web', 'Web', 'Store', 'Web'], revenue: [10, 20, 30, 40] })

    await runPipeline({
      rawTable: makeRawTable(),
      file: makeFile(),
      structural: makeStructural(),
      llmOutputs: {
        dataDictionary: done(DICTIONARY),
        businessInsights: pending(),
        explanation: pending(),
        clientQuestions: pending(),
      },
      cleaningPlan: done(PLAN),
      cleaning: done({ entries: [] }),
      eda: pending(),
      cleanedTable: alreadyCleaned,
      analysis: { numeric: [], quality: emptyQuality(), dates: [] },
      onStepUpdate: (u) => updates.push(u),
    })

    const steps = updates.map((u) => u.step)
    expect(steps).not.toContain('dataDictionary')
    expect(steps).not.toContain('planCleaning')
    expect(steps).not.toContain('clean')
    expect(steps[0]).toBe('eda')

    // EDA ran against the already-cleaned table (not re-cleaning from raw).
    const edaUpdate = updates.find((u) => u.step === 'eda' && u.slot.status === 'done')
    expect(edaUpdate?.eda?.numeric[0].column).toBe('revenue')
  })

  it('resumes correctly when interrupted after EDA but before business insights', async () => {
    const updates: PipelineStepUpdate[] = []
    const alreadyCleaned = aq.table({ chnl: ['Web', 'Web', 'Store', 'Web'], revenue: [10, 20, 30, 40] })
    const finalQuality = emptyQuality()

    await runPipeline({
      rawTable: makeRawTable(),
      file: makeFile(),
      structural: makeStructural(),
      llmOutputs: {
        dataDictionary: done(DICTIONARY),
        businessInsights: pending(),
        explanation: pending(),
        clientQuestions: pending(),
      },
      cleaningPlan: done(PLAN),
      cleaning: done({ entries: [] }),
      eda: done(null),
      cleanedTable: alreadyCleaned,
      analysis: { numeric: [], quality: finalQuality, dates: [] },
      onStepUpdate: (u) => updates.push(u),
    })

    const steps = updates.map((u) => u.step)
    expect(steps).not.toContain('dataDictionary')
    expect(steps).not.toContain('planCleaning')
    expect(steps).not.toContain('clean')
    expect(steps).not.toContain('eda')
    expect(steps).toEqual([
      'businessInsights',
      'businessInsights',
      'explanation',
      'explanation',
      'clientQuestions',
      'clientQuestions',
    ])

    // clientQuestions used the RESUMED (persisted) post-clean quality
    // report, since eda didn't re-run.
    expect(generateClientQuestionsMock).toHaveBeenCalledWith(
      expect.anything(),
      finalQuality,
      expect.anything(),
    )
  })

  it('a failure in dataDictionary/planCleaning reports both as error and stops', async () => {
    understandAndPlanMock.mockRejectedValue(new Error('boom'))
    const updates: PipelineStepUpdate[] = []

    await runPipeline({
      rawTable: makeRawTable(),
      file: makeFile(),
      structural: makeStructural(),
      llmOutputs: {
        dataDictionary: pending(),
        businessInsights: pending(),
        explanation: pending(),
        clientQuestions: pending(),
      },
      cleaningPlan: pending<CleaningPlan>(),
      cleaning: pending(),
      eda: pending(),
      cleanedTable: makeRawTable(),
      analysis: { numeric: [], quality: emptyQuality(), dates: [] },
      onStepUpdate: (u) => updates.push(u),
    })

    const errored = updates.filter((u) => u.slot.status === 'error').map((u) => u.step)
    expect(errored.sort()).toEqual(['dataDictionary', 'planCleaning'])
    // Nothing past the failure point ran.
    expect(updates.some((u) => u.step === 'clean')).toBe(false)
  })
})

function emptyQuality() {
  return {
    missingValues: [],
    duplicateRows: {
      checkName: 'duplicate-rows',
      description: '',
      count: 0,
      percentage: 0,
      affectedColumns: [],
      sampleItems: [],
      severity: 'info' as const,
    },
    inconsistentCategoricals: [],
    mixedTypes: [],
  }
}
