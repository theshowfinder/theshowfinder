// Reads the first sheet of an .xlsx file into rows of text, with no extra package (26 Nov 2026, for the outreach
// spreadsheet import). An .xlsx is a zip of XML files: this finds xl/sharedStrings.xml and the first worksheet in the
// zip's central directory, inflates them with Node's zlib, and reads the cells. Good enough for plain data sheets;
// formulas give their last saved value.
import { inflateRawSync } from 'zlib'

function unzipEntries(buf: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>()
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  if (eocd < 0) throw new Error('Not an Excel (.xlsx) file')
  const count = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break
    const method = buf.readUInt16LE(p + 10), size = buf.readUInt32LE(p + 20)
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32)
    const local = buf.readUInt32LE(p + 42)
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8')
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28)
    const data = buf.subarray(start, start + size)
    if (/^xl\/(sharedStrings\.xml|workbook\.xml|_rels\/workbook\.xml\.rels|worksheets\/sheet\d+\.xml)$/.test(name)) out.set(name, method === 8 ? inflateRawSync(data) : Buffer.from(data))
    p += 46 + nameLen + extraLen + commentLen
  }
  return out
}

const unescape = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&amp;/g, '&')
const colIndex = (ref: string) => { let n = 0; for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1 }

function sheetRows(xml: string, shared: string[]): string[][] {
  const rows: string[][] = []
  for (const r of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: string[] = []
    for (const c of r[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1], body = c[2] ?? ''
      const ref = attrs.match(/\br="([A-Z]+\d+)"/)?.[1]
      const type = attrs.match(/\bt="([^"]+)"/)?.[1]
      const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1]
      const text = type === 's' ? shared[Number(v)] ?? '' : type === 'inlineStr' ? unescape([...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => t[1]).join('')) : unescape(v ?? '')
      row[ref ? colIndex(ref) : row.length] = text
    }
    rows.push(Array.from(row, x => x ?? ''))
  }
  return rows
}

/** Every sheet of the workbook, in tab order, as rows of text. */
export function xlsxSheets(buf: Buffer): Array<{ name: string; rows: string[][] }> {
  const files = unzipEntries(buf)
  const shared = [...(files.get('xl/sharedStrings.xml')?.toString('utf8') ?? '').matchAll(/<si>([\s\S]*?)<\/si>/g)]
    .map(m => unescape([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => t[1]).join('')))
  const wb = files.get('xl/workbook.xml')?.toString('utf8') ?? ''
  const rels = files.get('xl/_rels/workbook.xml.rels')?.toString('utf8') ?? ''
  const targetOf = (id: string) => {
    const rel = [...rels.matchAll(/<Relationship\b[^>]*>/g)].map(m => m[0]).find(t => t.includes(`Id="${id}"`))
    const t = rel?.match(/Target="([^"]+)"/)?.[1]
    return t ? 'xl/' + t.replace(/^\/?xl\//, '').replace(/^\//, '') : null
  }
  const sheets = [...wb.matchAll(/<sheet\b[^>]*>/g)].map(m => ({ name: unescape(m[0].match(/name="([^"]*)"/)?.[1] ?? ''), path: targetOf(m[0].match(/r:id="([^"]+)"/)?.[1] ?? '') }))
  const out = sheets.filter(s => s.path && files.has(s.path)).map(s => ({ name: s.name, rows: sheetRows(files.get(s.path!)!.toString('utf8'), shared) }))
  if (!out.length) for (const [k, v] of files) if (k.startsWith('xl/worksheets/')) out.push({ name: k, rows: sheetRows(v.toString('utf8'), shared) })
  return out
}

/** The first sheet's rows. */
export function xlsxRows(buf: Buffer): string[][] {
  return xlsxSheets(buf)[0]?.rows ?? []
}
