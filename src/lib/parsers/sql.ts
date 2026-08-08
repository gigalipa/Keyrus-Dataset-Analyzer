/**
 * SQL dump parser (Phase 2, Milestone 2.3).
 *
 * Parses standard `mysqldump`/`pg_dump --inserts`-style SQL export files:
 * a `CREATE TABLE` (DDL) statement followed by one or more `INSERT INTO`
 * (DML) statements. The schema is extracted first, since column names and
 * types give the context needed to interpret the records that follow (per
 * the "SQL parsing scope" open question in docs/development-process.md).
 *
 * Deliberately out of scope (per the same open question, "we can skip
 * complex database administration DDL"):
 * - `CREATE VIEW`, `CREATE TRIGGER`, `CREATE PROCEDURE`/`FUNCTION`
 * - `GRANT`/`REVOKE` and other permission statements
 * - `ALTER TABLE`, `CREATE INDEX` issued separately from the table body
 * - PostgreSQL `COPY ... FROM stdin` bulk-load blocks (the pg_dump
 *   *default* data format) — only literal `INSERT INTO ... VALUES (...)`
 *   statements are parsed, which matches `pg_dump --inserts` /
 *   `--column-inserts` output and mysqldump's default output
 *
 * Documented limitation: this module extracts a single "primary" table —
 * the first `CREATE TABLE` in the file — and only the `INSERT INTO`
 * statements that target that same table. Multi-table dumps are not
 * unreasonable in the wild, but the spec describes a single client dataset
 * export, so full multi-table support is left out of scope for this
 * milestone. Any `CREATE TABLE`/`INSERT INTO` for other tables in the file
 * is ignored rather than merged or reported as an error.
 *
 * This module is intentionally standalone: it does not touch the Arquero
 * pipeline or any UI component. Wiring it into the app is Milestone 2.4.
 */

/** Only the first N rows of INSERT data are ever materialized into `rows`. */
export const SQL_PARSER_ROW_LIMIT = 1000

/** Schema + sample data extracted from a SQL dump file. */
export interface SqlParseResult {
  /** Name of the primary (first) table found in the dump. */
  tableName: string
  /** Column names, in schema (`CREATE TABLE`) order. */
  headers: string[]
  /** Column name -> raw SQL type (e.g. `"VARCHAR(255)"`, `"INT UNSIGNED"`). */
  columnTypes: Record<string, string>
  /** Data rows extracted from `INSERT` statements, capped at {@link SQL_PARSER_ROW_LIMIT}. */
  rows: Record<string, unknown>[]
  /** Total number of data rows found across all matching `INSERT` statements, uncapped. */
  totalRowCount: number
  /** True when `totalRowCount` exceeds {@link SQL_PARSER_ROW_LIMIT}, i.e. `rows` was truncated. */
  truncated: boolean
}

/**
 * Parses a `.sql` dump `File` into a table schema plus (capped) row data.
 *
 * Throws a descriptive `Error` when no usable `CREATE TABLE` statement is
 * found, or when it has no recognizable column definitions — callers
 * (Milestone 2.4's Arquero integration / UI layer) are expected to catch
 * this and surface it as a user-facing parse error, per the "Error
 * recovery" open question (show the error and, if detected, the cause).
 */
export async function parseSqlDump(file: File): Promise<SqlParseResult> {
  const rawText = await file.text()
  const sql = stripSqlComments(rawText)

  const schema = extractCreateTable(sql)
  if (!schema) {
    throw new Error(
      `No CREATE TABLE statement found in "${file.name}". SQL parsing requires ` +
        'a standard "CREATE TABLE name (...)" definition before any data rows can be interpreted.',
    )
  }
  if (schema.headers.length === 0) {
    throw new Error(
      `CREATE TABLE for "${schema.tableName}" in "${file.name}" has no recognizable ` +
        'column definitions (only constraints/keys were found).',
    )
  }

  const { rows, totalRowCount, truncated } = extractInsertRows(
    sql,
    schema.tableName,
    schema.headers,
    SQL_PARSER_ROW_LIMIT,
  )

  return {
    tableName: schema.tableName,
    headers: schema.headers,
    columnTypes: schema.columnTypes,
    rows,
    totalRowCount,
    truncated,
  }
}

// ---------------------------------------------------------------------------
// Comment stripping
// ---------------------------------------------------------------------------

/**
 * Removes `-- line`, `# line`, and `/* block *‍/` comments, while leaving the
 * contents of `'...'`, `"..."`, and `` `...` `` untouched (a comment marker
 * inside a string literal or quoted identifier is not a comment). Comment
 * bodies are replaced with a single blank/newline so surrounding statement
 * text does not get accidentally joined together.
 */
function stripSqlComments(sql: string): string {
  let result = ''
  let inSingle = false
  let inDouble = false
  let inBacktick = false

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i]
    const next = sql[i + 1]

    if (inSingle || inDouble) {
      const quote = inSingle ? "'" : '"'
      result += ch
      if (ch === '\\') {
        i++
        result += sql[i] ?? ''
        continue
      }
      if (ch === quote) {
        if (next === quote) {
          result += next
          i++
          continue
        }
        inSingle = false
        inDouble = false
      }
      continue
    }

    if (inBacktick) {
      result += ch
      if (ch === '`') inBacktick = false
      continue
    }

    if (ch === "'") {
      inSingle = true
      result += ch
      continue
    }
    if (ch === '"') {
      inDouble = true
      result += ch
      continue
    }
    if (ch === '`') {
      inBacktick = true
      result += ch
      continue
    }

    if (ch === '-' && next === '-') {
      i += 2
      while (i < sql.length && sql[i] !== '\n') i++
      result += '\n'
      continue
    }
    if (ch === '#') {
      i += 1
      while (i < sql.length && sql[i] !== '\n') i++
      result += '\n'
      continue
    }
    if (ch === '/' && next === '*') {
      const end = sql.indexOf('*/', i + 2)
      if (end === -1) {
        i = sql.length
        continue
      }
      i = end + 1
      result += ' '
      continue
    }

    result += ch
  }

  return result
}

// ---------------------------------------------------------------------------
// Low-level scanning helpers (quote/backtick/paren aware)
// ---------------------------------------------------------------------------

/**
 * Given the index of an opening `(`, returns the index of its matching `)`,
 * respecting nested parens and skipping over quoted/backtick-quoted content
 * so parens inside string literals or identifiers don't throw off the
 * balance. Returns -1 if no match is found.
 */
function findMatchingParen(text: string, openIndex: number): number {
  let depth = 0
  let inSingle = false
  let inDouble = false
  let inBacktick = false

  for (let i = openIndex; i < text.length; i++) {
    const ch = text[i]
    const next = text[i + 1]

    if (inSingle || inDouble) {
      const quote = inSingle ? "'" : '"'
      if (ch === '\\') {
        i++
        continue
      }
      if (ch === quote) {
        if (next === quote) {
          i++
          continue
        }
        inSingle = false
        inDouble = false
      }
      continue
    }
    if (inBacktick) {
      if (ch === '`') inBacktick = false
      continue
    }

    if (ch === "'") {
      inSingle = true
      continue
    }
    if (ch === '"') {
      inDouble = true
      continue
    }
    if (ch === '`') {
      inBacktick = true
      continue
    }
    if (ch === '(') depth++
    else if (ch === ')') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

/**
 * Splits `text` on top-level commas — commas that are not inside a quoted
 * string, a backtick-quoted identifier, or nested parens (e.g. the comma in
 * `DECIMAL(10,2)` or inside a function call in a VALUES tuple). Empty
 * segments (from trailing commas) are dropped.
 */
function splitTopLevelByComma(text: string): string[] {
  const parts: string[] = []
  let depth = 0
  let inSingle = false
  let inDouble = false
  let start = 0

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const next = text[i + 1]

    if (inSingle || inDouble) {
      const quote = inSingle ? "'" : '"'
      if (ch === '\\') {
        i++
        continue
      }
      if (ch === quote) {
        if (next === quote) {
          i++
          continue
        }
        inSingle = false
        inDouble = false
      }
      continue
    }

    if (ch === "'") {
      inSingle = true
      continue
    }
    if (ch === '"') {
      inDouble = true
      continue
    }
    if (ch === '`') {
      i++
      while (i < text.length && text[i] !== '`') i++
      continue
    }
    if (ch === '(') {
      depth++
      continue
    }
    if (ch === ')') {
      depth--
      continue
    }
    if (ch === ',' && depth === 0) {
      parts.push(text.slice(start, i))
      start = i + 1
    }
  }
  parts.push(text.slice(start))

  return parts.map((p) => p.trim()).filter((p) => p.length > 0)
}

/** Strips surrounding backticks/double-quotes from a SQL identifier, and lowercases it for comparison. */
function normalizeIdentifier(raw: string): string {
  const trimmed = raw.trim()
  const unquoted =
    (trimmed.startsWith('`') && trimmed.endsWith('`')) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
      ? trimmed.slice(1, -1)
      : trimmed
  return unquoted.toLowerCase()
}

/** Strips surrounding backticks/double-quotes from a SQL identifier, preserving original case. */
function unquoteIdentifier(raw: string): string {
  const trimmed = raw.trim()
  if (
    (trimmed.startsWith('`') && trimmed.endsWith('`')) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

// ---------------------------------------------------------------------------
// CREATE TABLE (DDL) parsing
// ---------------------------------------------------------------------------

const CREATE_TABLE_RE =
  /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(`[^`]+`|"[^"]+"|[A-Za-z_][\w$]*)\s*\(/i

/** Table-level constraint/index keywords — definitions starting with these are not columns. */
const CONSTRAINT_KEYWORD_RE =
  /^(PRIMARY\s+KEY|UNIQUE(\s+KEY|\s+INDEX)?|KEY|INDEX|CONSTRAINT|FOREIGN\s+KEY|CHECK|FULLTEXT(\s+KEY|\s+INDEX)?|SPATIAL(\s+KEY|\s+INDEX)?)\b/i

interface TableSchema {
  tableName: string
  headers: string[]
  columnTypes: Record<string, string>
}

/** Finds the first `CREATE TABLE` statement and extracts its table name and column schema. */
function extractCreateTable(sql: string): TableSchema | null {
  const match = CREATE_TABLE_RE.exec(sql)
  if (!match) return null

  const tableName = unquoteIdentifier(match[1])
  const openParenIndex = match.index + match[0].length - 1
  const closeParenIndex = findMatchingParen(sql, openParenIndex)
  if (closeParenIndex === -1) return null

  const body = sql.slice(openParenIndex + 1, closeParenIndex)
  const defs = splitTopLevelByComma(body)

  const headers: string[] = []
  const columnTypes: Record<string, string> = {}

  for (const def of defs) {
    if (CONSTRAINT_KEYWORD_RE.test(def)) continue

    const column = parseColumnDefinition(def)
    if (!column) continue
    if (column.name in columnTypes) continue // duplicate/malformed def, keep first

    headers.push(column.name)
    columnTypes[column.name] = column.type
  }

  return { tableName, headers, columnTypes }
}

/** Parses a single column definition (e.g. "`id` INT NOT NULL AUTO_INCREMENT") into a name/type pair. */
function parseColumnDefinition(
  def: string,
): { name: string; type: string } | null {
  const trimmed = def.trim()
  if (!trimmed) return null

  let name: string
  let rest: string

  if (trimmed.startsWith('`')) {
    const end = trimmed.indexOf('`', 1)
    if (end === -1) return null
    name = trimmed.slice(1, end)
    rest = trimmed.slice(end + 1).trim()
  } else if (trimmed.startsWith('"')) {
    const end = trimmed.indexOf('"', 1)
    if (end === -1) return null
    name = trimmed.slice(1, end)
    rest = trimmed.slice(end + 1).trim()
  } else {
    const identMatch = /^([A-Za-z_][\w$]*)\s*([\s\S]*)$/.exec(trimmed)
    if (!identMatch) return null
    name = identMatch[1]
    rest = identMatch[2]
  }

  const typeMatch = /^([A-Za-z_][\w]*)\s*(\([^)]*\))?/.exec(rest)
  if (!typeMatch) return null

  let type = typeMatch[1].toUpperCase()
  if (typeMatch[2]) type += typeMatch[2].replace(/\s+/g, '')

  const afterType = rest.slice(typeMatch[0].length).trim()
  const modifierMatch = /^(UNSIGNED|ZEROFILL)(\s+(UNSIGNED|ZEROFILL))?/i.exec(
    afterType,
  )
  if (modifierMatch) {
    type += ` ${modifierMatch[0].toUpperCase().replace(/\s+/g, ' ')}`
  }

  return { name, type }
}

// ---------------------------------------------------------------------------
// INSERT (DML) parsing
// ---------------------------------------------------------------------------

const INSERT_INTO_RE =
  /INSERT\s+(?:LOW_PRIORITY\s+|DELAYED\s+|HIGH_PRIORITY\s+)?(?:IGNORE\s+)?INTO\s+(`[^`]+`|"[^"]+"|[A-Za-z_][\w$]*)/gi

interface InsertExtractionResult {
  rows: Record<string, unknown>[]
  totalRowCount: number
  truncated: boolean
}

/**
 * Finds every `INSERT INTO` statement that targets `tableName` and extracts
 * its data rows. Only the first `limit` rows across all matching statements
 * are materialized into objects; rows beyond that are still counted (for an
 * accurate `totalRowCount`/`truncated`) but not built, keeping the cap cheap
 * to enforce on very large dumps.
 */
function extractInsertRows(
  sql: string,
  tableName: string,
  schemaHeaders: string[],
  limit: number,
): InsertExtractionResult {
  const rows: Record<string, unknown>[] = []
  let totalRowCount = 0
  const wantedTable = normalizeIdentifier(tableName)

  INSERT_INTO_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = INSERT_INTO_RE.exec(sql)) !== null) {
    const matchedTable = normalizeIdentifier(unquoteIdentifier(match[1]))
    if (matchedTable !== wantedTable) continue

    let idx = match.index + match[0].length
    idx = skipWhitespace(sql, idx)

    let columnList: string[] | null = null
    if (sql[idx] === '(') {
      const close = findMatchingParen(sql, idx)
      if (close === -1) continue
      const colsText = sql.slice(idx + 1, close)
      columnList = splitTopLevelByComma(colsText).map((c) =>
        unquoteIdentifier(c.trim()),
      )
      idx = skipWhitespace(sql, close + 1)
    }

    const valuesMatch = /^VALUES\s*/i.exec(sql.slice(idx))
    if (!valuesMatch) continue // not a literal VALUES insert (e.g. INSERT ... SELECT) — skip
    idx += valuesMatch[0].length
    idx = skipWhitespace(sql, idx)

    const columnsForRow = columnList ?? schemaHeaders

    // Walk the comma-separated list of "(...)" value tuples.
    while (sql[idx] === '(') {
      const close = findMatchingParen(sql, idx)
      if (close === -1) break

      totalRowCount++
      if (rows.length < limit) {
        const tupleText = sql.slice(idx + 1, close)
        const values = splitTopLevelByComma(tupleText).map(parseSqlLiteral)
        const row: Record<string, unknown> = {}
        columnsForRow.forEach((columnName, i) => {
          row[columnName] = i < values.length ? values[i] : null
        })
        rows.push(row)
      }

      idx = skipWhitespace(sql, close + 1)
      if (sql[idx] === ',') {
        idx = skipWhitespace(sql, idx + 1)
        continue
      }
      break
    }
  }

  return { rows, totalRowCount, truncated: totalRowCount > limit }
}

function skipWhitespace(text: string, from: number): number {
  let i = from
  while (i < text.length && /\s/.test(text[i])) i++
  return i
}

/** Converts a single SQL literal (as raw source text) to a JS value. */
function parseSqlLiteral(raw: string): unknown {
  const v = raw.trim()

  if (/^null$/i.test(v)) return null
  if (/^true$/i.test(v)) return true
  if (/^false$/i.test(v)) return false

  if (v.length >= 2 && v.startsWith("'") && v.endsWith("'")) {
    return unescapeSqlString(v.slice(1, -1), "'")
  }
  if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) {
    return unescapeSqlString(v.slice(1, -1), '"')
  }

  if (/^-?\d+$/.test(v)) {
    const n = Number(v)
    return Number.isSafeInteger(n) ? n : v // preserve precision as string if it overflows
  }
  if (/^-?\d+\.\d+([eE][+-]?\d+)?$/.test(v)) {
    return Number(v)
  }

  // Hex literals (x'1a2b'), function calls, and anything else we don't special-case
  // are passed through as their raw source text rather than guessed at.
  return v
}

/** Un-escapes a SQL string literal body: doubled quotes and backslash escapes. */
function unescapeSqlString(body: string, quote: "'" | '"'): string {
  const escapeMap: Record<string, string> = {
    n: '\n',
    r: '\r',
    t: '\t',
    b: '\b',
    '0': '\0',
    Z: '\x1a',
    "'": "'",
    '"': '"',
    '\\': '\\',
    '%': '%',
    _: '_',
  }

  let result = ''
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]
    const next = body[i + 1]

    if (ch === '\\' && next !== undefined) {
      result += escapeMap[next] ?? next
      i++
      continue
    }
    if (ch === quote && next === quote) {
      result += quote
      i++
      continue
    }
    result += ch
  }
  return result
}
