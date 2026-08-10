import { describe, expect, it } from 'vitest'
import { rowsToCsv } from './serializeCsv'

describe('rowsToCsv', () => {
  it('serializes a simple header + rows with CRLF line endings', () => {
    const csv = rowsToCsv(
      ['id', 'name'],
      [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ],
    )
    expect(csv).toBe('id,name\r\n1,Alice\r\n2,Bob\r\n')
  })

  it('quotes fields containing commas', () => {
    const csv = rowsToCsv(['city'], [{ city: 'Springfield, IL' }])
    expect(csv).toBe('city\r\n"Springfield, IL"\r\n')
  })

  it('quotes fields containing double quotes and doubles the embedded quote', () => {
    const csv = rowsToCsv(['quote'], [{ quote: 'She said "hi"' }])
    expect(csv).toBe('quote\r\n"She said ""hi"""\r\n')
  })

  it('quotes fields containing newlines (both \\n and \\r\\n)', () => {
    const csv = rowsToCsv(
      ['note'],
      [{ note: 'line one\nline two' }, { note: 'a\r\nb' }],
    )
    expect(csv).toBe('note\r\n"line one\nline two"\r\n"a\r\nb"\r\n')
  })

  it('renders null/undefined values as empty fields', () => {
    const csv = rowsToCsv(['a', 'b'], [{ a: null, b: undefined }])
    expect(csv).toBe('a,b\r\n,\r\n')
  })

  it('renders Date values as ISO strings', () => {
    const date = new Date('2024-01-15T00:00:00.000Z')
    const csv = rowsToCsv(['when'], [{ when: date }])
    expect(csv).toBe('when\r\n2024-01-15T00:00:00.000Z\r\n')
  })

  it('does not quote plain numbers or simple strings', () => {
    const csv = rowsToCsv(['n', 's'], [{ n: 42, s: 'plain' }])
    expect(csv).toBe('n,s\r\n42,plain\r\n')
  })

  it('looks up values by header name, not object key order', () => {
    const csv = rowsToCsv(['b', 'a'], [{ a: 1, b: 2 }])
    expect(csv).toBe('b,a\r\n2,1\r\n')
  })

  it('produces an empty field for a row missing a header key entirely', () => {
    const csv = rowsToCsv(['a', 'missing'], [{ a: 'x' }])
    expect(csv).toBe('a,missing\r\nx,\r\n')
  })

  it('handles zero rows, producing only the header line', () => {
    const csv = rowsToCsv(['a', 'b'], [])
    expect(csv).toBe('a,b\r\n')
  })
})
