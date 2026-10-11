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

function ticketValue(row: Record<string, string>, key: string) {
  return value(row, key) ?? value(row, `Tickets:${key}`)
}

function dateOnly(rawValue: string | null) {
  if (!rawValue) return null
  const value = rawValue.trim()
  const isoMatch = value.match(/(\d{4})[-\/]?(\d{2})[-\/]?(\d{2})/)
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`
  const ukMatch = value.match(/(\d{2})[-\/]?(\d{2})[-\/](\d{4})/)
  if (ukMatch) return `${ukMatch[3]}-${ukMatch[2]}-${ukMatch[1]}`
  const namedDate = new Date(value)
  return Number.isNaN(namedDate.getTime()) ? null : namedDate.toISOString().slice(0, 10)
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
      name: ticketValue(raw, 'event_name') ?? value(raw, 'product_name') ?? '',
      event_date: dateOnly(ticketValue(raw, 'event_date')),
      venue: ticketValue(raw, 'venue_name'),
      city: ticketValue(raw, 'event_location_city'),
      country: ticketValue(raw, 'event_location_country'),
      primary_artist: ticketValue(raw, 'primary_artist'),
      second_artist: ticketValue(raw, 'second_artist'),
      genre: ticketValue(raw, 'genre'),
      url: value(raw, 'aw_deep_link') ?? '',
      availability_status: value(raw, 'stock_status') ?? value(raw, 'is_for_sale'),
      available_from: timestamp(ticketValue(raw, 'available_from')),
      valid_from: timestamp(ticketValue(raw, 'valid_from')),
      valid_to: timestamp(ticketValue(raw, 'valid_to')),
      min_price: numberValue(ticketValue(raw, 'min_price')),
      max_price: numberValue(ticketValue(raw, 'max_price')),
      raw,
    }
  }).filter(row => row.id && row.name && row.url)
}
