/**
 * Data dictionary generation — Phase 4, Milestone 4.2. Builds the
 * dictionary-entry prompt (column names, sample values, data types, and
 * dataset context, per the roadmap's done-when condition) from Phase 3's
 * `StructuralAnalysis`, and calls Groq (per Milestone 4.2's Provider line)
 * via the shared `runStructuredInsightRequest` (`client.ts`), returning a
 * schema-conformant `InsightGroup` with exactly one `dictionaryEntry` item
 * per analyzed column.
 *
 * The LLM is asked to explain each column's *meaning/purpose* only — the
 * actual `dataType` and a few real `sampleValues` are already known from
 * Phase 3's structural analysis, so this module overwrites each returned
 * item's `metadata` with those real values after validation rather than
 * trusting the model to restate them accurately. It also enriches each
 * item's `tags` with a `type:<dataType>` facet and, where relevant, a
 * `quality:*` facet (e.g. a column with no non-empty sample values), so the
 * display component (`DataDictionaryPanel.tsx`) can offer tag-based
 * filtering by data type or by data-quality concern without inventing a
 * bespoke shape.
 */
import { runStructuredInsightRequest } from './client'
import { callGroqRawText } from './groq'
import {
  buildSystemPrompt,
  formatDatasetContext,
  formatInsightGroupInstruction,
} from './prompt'
import type { InsightGroup } from './schema'
import type {
  ColumnMetadata,
  DatasetStatistics,
  StructuralAnalysis,
} from '../analysis/structural'

/** Max sample values shown to the LLM in the prompt, and re-attached to each item's `metadata.sampleValues`. */
const MAX_SAMPLE_VALUES = 5

const TASK_INSTRUCTIONS = [
  'Task: generate a data dictionary entry for every column listed below in',
  '"Columns to document". For each column, explain — in plain, non-technical',
  "language a client's stakeholders could understand — what the column most",
  'likely represents in the business and how a consultant might use it: its',
  'meaning and purpose. Use the column name, its sample values, and the',
  'overall dataset context as clues, but do not simply restate the data type',
  'or repeat the sample values back verbatim — those are already known and',
  'are given to you only as context for inferring meaning.',
].join('\n')

export interface GenerateDataDictionaryParams {
  /** Phase 3's structural analysis (`analyzeStructure`) for the uploaded dataset. */
  analysis: StructuralAnalysis
  /** Optional dataset/file name, included in the prompt's dataset context if provided. */
  datasetName?: string
  signal?: AbortSignal
}

/**
 * Generates a data dictionary for `analysis.columns`: one schema-conformant
 * `dictionaryEntry` `InsightItem` per column, with the LLM's generated
 * `title`/`description`/`tags` plus real `dataType`/`sampleValues` attached
 * via `metadata`. Throws `LlmError` (via `runStructuredInsightRequest`) on
 * any provider/validation failure, or a plain `Error` if `analysis` has no
 * columns to document.
 */
export async function generateDataDictionary(
  params: GenerateDataDictionaryParams,
): Promise<InsightGroup> {
  const { analysis, datasetName, signal } = params
  const { columns, stats } = analysis

  if (columns.length === 0) {
    throw new Error(
      'Cannot generate a data dictionary: the dataset has no columns to document.',
    )
  }

  const systemPrompt = buildSystemPrompt(TASK_INSTRUCTIONS)
  const userContent = buildUserContent(columns, stats, datasetName)

  const group = await runStructuredInsightRequest({
    type: 'dictionaryEntry',
    systemPrompt,
    userContent,
    callProvider: callGroqRawText,
    expectedCount: columns.length,
    signal,
  })

  return attachColumnMetadata(group, columns)
}

/** Renders the dataset context and per-column info (names, sample values, data types) plus the output-shape instruction, per the roadmap's prompt-template done-when condition. */
function buildUserContent(
  columns: ColumnMetadata[],
  stats: DatasetStatistics,
  datasetName: string | undefined,
): string {
  const contextBlock = formatDatasetContext('Dataset context', {
    datasetName: datasetName ?? 'unknown',
    totalRows: stats.totalRows,
    totalColumns: stats.totalColumns,
    fileSizeMB: Math.round(stats.fileSizeMB * 100) / 100,
  })

  const columnsBlock = formatDatasetContext(
    'Columns to document (in this exact order)',
    {
      columns: columns.map((column) => ({
        name: column.name,
        dataType: column.dataType,
        sampleValues: column.sampleValues
          .slice(0, MAX_SAMPLE_VALUES)
          .map((value) => String(value)),
      })),
    },
  )

  const shapeInstruction = formatInsightGroupInstruction(
    'dictionaryEntry',
    columns.length,
  )

  return [
    contextBlock,
    '',
    columnsBlock,
    '',
    shapeInstruction,
    '',
    'Return the items in the exact same order as the columns listed above,',
    "and set each item's metadata.columnName to that column's exact name.",
  ].join('\n')
}

/**
 * Overwrites each returned item's `metadata` with the real `columnName`,
 * `dataType`, and `sampleValues` from Phase 3's analysis (matched by
 * `metadata.columnName` when the model set it correctly, falling back to
 * positional order since `expectedCount` guarantees the item count matches
 * the column count), and enriches `tags` with a data-type facet and any
 * data-quality-concern facets.
 */
function attachColumnMetadata(
  group: InsightGroup,
  columns: ColumnMetadata[],
): InsightGroup {
  const columnsByName = new Map(columns.map((column) => [column.name, column]))

  const items = group.items.map((item, index) => {
    const claimedName =
      typeof item.metadata?.columnName === 'string' && item.metadata.columnName
        ? item.metadata.columnName
        : undefined
    const column =
      (claimedName ? columnsByName.get(claimedName) : undefined) ??
      columns[index]

    const tags = Array.from(
      new Set([...item.tags, ...buildQualityTags(column)]),
    )

    return {
      ...item,
      tags,
      metadata: {
        ...item.metadata,
        columnName: column.name,
        dataType: column.dataType,
        sampleValues: column.sampleValues.slice(0, MAX_SAMPLE_VALUES),
      },
    }
  })

  return { ...group, items }
}

/** Data-type and data-quality-concern tags derived from Phase 3's analysis, for the display component's tag-based filtering. */
function buildQualityTags(column: ColumnMetadata): string[] {
  const tags = [`type:${column.dataType}`]
  if (column.dataType === 'null') tags.push('quality:all-null')
  if (column.sampleValues.length === 0) tags.push('quality:no-sample-values')
  return tags
}
