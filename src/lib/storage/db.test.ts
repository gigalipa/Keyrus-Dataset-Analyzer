/**
 * Round-trip tests for the IndexedDB storage layer (Phase 6, Milestone 6.1).
 *
 * Runs against `fake-indexeddb`, a spec-compliant IndexedDB implementation
 * for Node — not a mock of this module's own API, so `createDataset` /
 * `getDataset` / `updateDataset` / `deleteDataset` / `listDatasets` all
 * exercise the real `idb` wrapper against a real (if in-memory) IndexedDB
 * engine, the same code path the browser uses.
 */
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  createDataset,
  deleteDataset,
  getDataset,
  listDatasets,
  updateDataset,
  __resetDbConnectionForTests,
} from './db'
import { createPendingLlmOutputs, type PersistedDataset } from '../../types/persistedDataset'
import type { NormalizedTable } from '../../types/parsedTable'
import type { StructuralAnalysis } from '../analysis/structural'
import type { DataQualityReport } from '../analysis/quality'

function buildFixtureRecord(id: string): PersistedDataset {
  const headers = ['id', 'name', 'revenue']
  const rawRows: Record<string, unknown>[] = [
    { id: '1', name: 'Acme', revenue: '1000' },
    { id: '2', name: 'Globex', revenue: '2000' },
    { id: '3', name: 'Initech', revenue: '' },
  ]
  const cleanedRows: Record<string, unknown>[] = [
    { id: 1, name: 'Acme', revenue: 1000 },
    { id: 2, name: 'Globex', revenue: 2000 },
    { id: 3, name: 'Initech', revenue: null },
  ]

  const rawTable: NormalizedTable = {
    headers,
    rows: rawRows,
    rowCount: rawRows.length,
    sourceFormat: 'csv',
    encoding: 'utf-8',
    delimiter: ',',
  }

  const structural: StructuralAnalysis = {
    columns: [
      { name: 'id', index: 0, dataType: 'integer', sampleValues: [1, 2, 3] },
      { name: 'name', index: 1, dataType: 'string', sampleValues: ['Acme', 'Globex', 'Initech'] },
      { name: 'revenue', index: 2, dataType: 'number', sampleValues: [1000, 2000] },
    ],
    stats: { totalRows: 3, totalColumns: 3, fileSizeMB: 0.0001 },
  }

  const quality: DataQualityReport = {
    missingValues: [
      {
        checkName: 'missing-values',
        description: 'revenue has 1 missing value',
        count: 1,
        percentage: 33.33,
        affectedColumns: ['revenue'],
        sampleItems: [],
        severity: 'warning',
      },
    ],
    duplicateRows: {
      checkName: 'duplicate-rows',
      description: 'No duplicate rows found',
      count: 0,
      percentage: 0,
      affectedColumns: [],
      sampleItems: [],
      severity: 'info',
    },
    inconsistentCategoricals: [],
    mixedTypes: [],
  }

  return {
    id,
    fileName: 'fixture.csv',
    uploadedAt: Date.now(),
    rawTable,
    cleanedTable: { headers, rows: cleanedRows },
    analysis: {
      structural,
      numeric: [],
      quality,
      dates: [],
    },
    llmOutputs: createPendingLlmOutputs(),
  }
}

describe('IndexedDB storage layer', () => {
  beforeEach(async () => {
    await __resetDbConnectionForTests()
    // fake-indexeddb keeps state across tests in the same process; delete
    // any leftover DB so each test starts from a clean slate.
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase('keyrus-dataset-analyzer')
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
      req.onblocked = () => resolve()
    })
  })

  it('round-trips a full record through createDataset/getDataset, including raw and cleaned tables', async () => {
    const record = buildFixtureRecord('ds-1')
    await createDataset(record)

    const loaded = await getDataset('ds-1')
    expect(loaded).toEqual(record)
    expect(loaded?.rawTable.rows).toHaveLength(3)
    expect(loaded?.cleanedTable.rows).toHaveLength(3)
    expect(loaded?.cleanedTable.headers).toEqual(['id', 'name', 'revenue'])
    expect(loaded?.llmOutputs.dataDictionary.status).toBe('pending')
  })

  it('updateDataset patches only the targeted field, leaving the rest untouched', async () => {
    const record = buildFixtureRecord('ds-2')
    await createDataset(record)

    const updated = await updateDataset('ds-2', {
      llmOutputs: {
        ...record.llmOutputs,
        dataDictionary: { status: 'done', data: null },
      },
    })
    expect(updated.llmOutputs.dataDictionary.status).toBe('done')

    const reloaded = await getDataset('ds-2')
    expect(reloaded?.llmOutputs.dataDictionary.status).toBe('done')
    // Untouched slots and fields must be unchanged.
    expect(reloaded?.llmOutputs.businessInsights).toEqual(record.llmOutputs.businessInsights)
    expect(reloaded?.fileName).toBe(record.fileName)
    expect(reloaded?.rawTable).toEqual(record.rawTable)
  })

  it('listDatasets returns a summary for every stored record, newest first', async () => {
    const a = buildFixtureRecord('ds-a')
    a.uploadedAt = 1000
    const b = buildFixtureRecord('ds-b')
    b.uploadedAt = 2000

    await createDataset(a)
    await createDataset(b)

    const list = await listDatasets()
    expect(list.map((d) => d.id)).toEqual(['ds-b', 'ds-a'])
    expect(list[0]).toEqual({ id: 'ds-b', fileName: 'fixture.csv', uploadedAt: 2000 })
  })

  it('deleteDataset removes the record from both getDataset and listDatasets', async () => {
    const record = buildFixtureRecord('ds-3')
    await createDataset(record)
    expect(await getDataset('ds-3')).toBeDefined()

    await deleteDataset('ds-3')

    expect(await getDataset('ds-3')).toBeUndefined()
    const list = await listDatasets()
    expect(list.find((d) => d.id === 'ds-3')).toBeUndefined()
  })
})
