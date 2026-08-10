/**
 * IndexedDB wrapper — Phase 6, Milestone 6.1.
 *
 * Thin, promise-based access to the app's `PersistedDataset` records, built
 * on the `idb` package rather than hand-rolled `indexedDB.open()` callback
 * code. One object store (`datasets`), keyed by `PersistedDataset.id`, with
 * an index on `uploadedAt` so `listDatasets()` (Milestone 6.2's History
 * sidebar) can list newest-first without loading every full record.
 *
 * `listDatasets()` returns lightweight `{ id, fileName, uploadedAt }`
 * summaries rather than full records. Records can carry a full parsed
 * table, a cleaned table, and multiple LLM outputs — plausibly several MB
 * each — so materializing every stored dataset in full just to render a
 * name/date list would be wasteful. IndexedDB doesn't support "projecting"
 * only some fields of a stored value out of a cursor, so this is done by
 * cursoring the store and picking off just the three summary fields per
 * record rather than deserializing structures we then discard; there isn't
 * a cheaper option available (a `getAll()` would materialize entire values
 * too). `getDataset(id)` still returns the full record — that's the
 * point where the whole payload is genuinely needed.
 */
import { openDB, type IDBPDatabase } from 'idb'
import type { PersistedDataset, PersistedDatasetSummary } from '../../types/persistedDataset'
import { assertWriteFitsQuota } from './quota'

const DB_NAME = 'keyrus-dataset-analyzer'
const DB_VERSION = 1
const STORE_NAME = 'datasets'
const UPLOADED_AT_INDEX = 'by-uploadedAt'

let dbPromise: Promise<IDBPDatabase> | null = null

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex(UPLOADED_AT_INDEX, 'uploadedAt')
      },
    })
  }
  return dbPromise
}

/** Thrown by `getDataset`/`updateDataset`/`deleteDataset` when no record exists for the given id. */
export class DatasetNotFoundError extends Error {
  readonly id: string
  constructor(id: string) {
    super(`No dataset found with id "${id}".`)
    this.name = 'DatasetNotFoundError'
    this.id = id
  }
}

/**
 * Persists a new dataset record. Runs the storage-quota guard
 * (`assertWriteFitsQuota`) first; on likely-insufficient space this throws
 * `StorageQuotaError` instead of attempting (and potentially
 * partially-committing) the write.
 */
export async function createDataset(record: PersistedDataset): Promise<void> {
  await assertWriteFitsQuota(record)
  const db = await getDb()
  await db.put(STORE_NAME, record)
}

/** Reads one full dataset record by id, or `undefined` if none exists. */
export async function getDataset(id: string): Promise<PersistedDataset | undefined> {
  const db = await getDb()
  return db.get(STORE_NAME, id)
}

/**
 * Lists lightweight summaries of every stored dataset, newest-first (see
 * module doc comment for why this doesn't return full records).
 */
export async function listDatasets(): Promise<PersistedDatasetSummary[]> {
  const db = await getDb()
  const tx = db.transaction(STORE_NAME, 'readonly')
  const index = tx.store.index(UPLOADED_AT_INDEX)

  const summaries: PersistedDatasetSummary[] = []
  // Iterate newest-first via the uploadedAt index; 'prev' walks descending.
  let cursor = await index.openCursor(null, 'prev')
  while (cursor) {
    const { id, fileName, uploadedAt } = cursor.value as PersistedDataset
    summaries.push({ id, fileName, uploadedAt })
    cursor = await cursor.continue()
  }
  await tx.done
  return summaries
}

/**
 * Applies a partial update to an existing dataset record — e.g. Phase 8's
 * pipeline flipping one LLM output slot's status without rewriting the rest
 * of the record. Throws `DatasetNotFoundError` if `id` doesn't exist, and
 * runs the same quota guard as `createDataset` before writing the merged
 * record.
 */
export async function updateDataset(
  id: string,
  patch: Partial<PersistedDataset>,
): Promise<PersistedDataset> {
  const db = await getDb()

  // Read and quota-check happen outside any IndexedDB transaction:
  // `assertWriteFitsQuota` awaits `navigator.storage.estimate()`, a
  // non-IDB promise, and IDB transactions auto-commit once their event
  // loop turn ends with no pending request — holding one open across that
  // await would risk a "transaction finished" error in some engines. The
  // final `put` below runs in its own short-lived transaction instead.
  const existing = (await db.get(STORE_NAME, id)) as PersistedDataset | undefined
  if (!existing) {
    throw new DatasetNotFoundError(id)
  }

  const merged: PersistedDataset = { ...existing, ...patch, id: existing.id }
  await assertWriteFitsQuota(merged)
  await db.put(STORE_NAME, merged)

  return merged
}

/** Deletes a dataset record. No-ops (does not throw) if `id` doesn't exist. */
export async function deleteDataset(id: string): Promise<void> {
  const db = await getDb()
  await db.delete(STORE_NAME, id)
}
