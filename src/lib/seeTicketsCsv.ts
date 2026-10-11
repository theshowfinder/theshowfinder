export type SeeTicketsRow = {
  id: string
  merchant_product_id: string | null
  name: string
  event_date: string | null
  venue: string | null
  city: string | null
  country: string | null
  primary_artist: string | null
  second_artist: string | null
  genre: string | null
  url: string
  availability_status: string | null
  available_from: string | null
  valid_from: string | null
  valid_to: string | null
  min_price: number | null
  max_price: number | null
  raw: Record<string, string>
}

function parseCsv(input: string) {
  const firstLine = input.split(/\r?\n/, 1)[0] ?? ''
  const delimiter = firstLine.includes('\t') ? '\t' : firstLine.includes('|') ? '|' : ','
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < input.length; i++) {
    const char = input[i]
    const next = input[i + 1]
    if (char === '"') {
      if (quoted && next === '"') { cell += '"'; i++; continue }
      quoted = !quoted
    } else if (char === delimiter && !quoted) {
      row.push(cell); cell = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i++
      row.push(cell); cell = ''
      if (row.some(value => value.trim() !== '')) rows.push(row)
      row = []
    } else cell += char
  }
  if (cell || row.length) { row.push(cell); if (row.some(value => value.trim() !== '')) rows.push(row) }
  return rows
}

function value(row: Record<string, string>, key: string) {
  return (row[key] ?? '').trim() || null
}

function dateOnly(rawValue: string | null) {
  if (!rawValue) return null
  const match = rawValue.match(/(\d{4})[-\/]?(\d{2})[-\/]?(\d{2})/)
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null
}

function numberValue(rawValue: string | null) {
  if (!rawValue) return null
  const parsed = Number(rawValue.replace(/[^0-9.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

function timestamp(rawValue: string | null) {
  if (!rawValue) return null
  const parsed = new Date(rawValue)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

export function parseSeeTicketsCsv(input: string): SeeTicketsRow[] {
  const rows = parseCsv(input.replace(/^\uFEFF/, ''))
  const headers = (rows.shift() ?? []).map(header => header.trim())
  return rows.map(columns => {
    const raw = Object.fromEntries(headers.map((header, index) => [header, columns[index] ?? '']))
    return {
      id: value(raw, 'aw_product_id') ?? value(raw, 'merchant_product_id') ?? '',
      merchant_product_id: value(raw, 'merchant_product_id'),
      name: value(raw, 'event_name') ?? value(raw, 'product_name') ?? '',
      event_date: dateOnly(value(raw, 'event_date')),
      venue: value(raw, 'venue_name'),
      city: value(raw, 'event_location_city'),
      country: value(raw, 'event_location_country'),
      primary_artist: value(raw, 'primary_artist'),
      second_artist: value(raw, 'second_artist'),
      genre: value(raw, 'genre'),
      url: value(raw, 'aw_deep_link') ?? '',
      availability_status: value(raw, 'stock_status') ?? value(raw, 'is_for_sale'),
      available_from: timestamp(value(raw, 'available_from')),
      valid_from: timestamp(value(raw, 'valid_from')),
      valid_to: timestamp(value(raw, 'valid_to')),
      min_price: numberValue(value(raw, 'min_price')),
      max_price: numberValue(value(raw, 'max_price')),
      raw,
    }
  }).filter(row => row.id && row.name && row.url)
}
