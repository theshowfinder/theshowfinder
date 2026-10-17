// Towns that belong to a main city hub. A nearby town does NOT get a page of
// its own: its shows are folded into the hub's city page ("Around Derby") and
// each card already says which town the venue is in. A town should only be
// promoted to a standalone page when it has the events, venues or search
// demand to justify one (see the local-hub notes), never automatically.
//
// `match` lists the spellings Ticketmaster and the admin form use for the
// venue city, because events are matched on the venue_city text. A town with no
// upcoming events simply doesn't show, so listing one is harmless.

export interface NearbyArea {
  /** Display name. */
  name: string
  /** venue_city spellings that belong to this town (matched case-insensitively). */
  match: string[]
}

export const NEARBY_AREAS: Record<string, NearbyArea[]> = {
  Derby: [
    { name: 'Burton upon Trent', match: ['Burton upon Trent', 'Burton-on-Trent', 'Burton on Trent'] },
    { name: 'Chesterfield', match: ['Chesterfield'] },
    { name: 'Ilkeston', match: ['Ilkeston'] },
    { name: 'Long Eaton', match: ['Long Eaton'] },
    { name: 'Castle Donington', match: ['Castle Donington', 'Donington Park'] },
  ],
  Manchester: [
    { name: 'Salford', match: ['Salford'] },
    { name: 'Stockport', match: ['Stockport'] },
    { name: 'Warrington', match: ['Warrington'] },
    { name: 'Wigan', match: ['Wigan'] },
    { name: 'Bolton', match: ['Bolton'] },
    { name: 'Oldham', match: ['Oldham'] },
    { name: 'Bury', match: ['Bury'] },
    { name: 'Altrincham', match: ['Altrincham'] },
  ],
  Leeds: [
    { name: 'Harrogate', match: ['Harrogate'] },
    { name: 'Huddersfield', match: ['Huddersfield'] },
    { name: 'Halifax', match: ['Halifax'] },
    { name: 'Wakefield', match: ['Wakefield'] },
  ],
  Bradford: [
    { name: 'Saltaire', match: ['Saltaire'] },
    { name: 'Ilkley', match: ['Ilkley'] },
    { name: 'Halifax', match: ['Halifax'] },
    { name: 'Keighley', match: ['Keighley'] },
  ],
  Sheffield: [
    { name: 'Chesterfield', match: ['Chesterfield'] },
    { name: 'Rotherham', match: ['Rotherham'] },
    { name: 'Barnsley', match: ['Barnsley'] },
  ],
  Newcastle: [
    { name: 'Gateshead', match: ['Gateshead'] },
    { name: 'Whitley Bay', match: ['Whitley Bay'] },
    { name: 'Durham', match: ['Durham'] },
    { name: 'South Shields', match: ['South Shields'] },
  ],
  Middlesbrough: [
    { name: 'Stockton-on-Tees', match: ['Stockton-on-Tees', 'Stockton on Tees'] },
    { name: 'Darlington', match: ['Darlington'] },
    { name: 'Whitby', match: ['Whitby'] },
    { name: 'Redcar', match: ['Redcar'] },
  ],
  Hull: [
    { name: 'Beverley', match: ['Beverley'] },
    { name: 'Scunthorpe', match: ['Scunthorpe'] },
    { name: 'Grimsby', match: ['Grimsby'] },
  ],
  Nottingham: [
    { name: 'Mansfield', match: ['Mansfield'] },
    { name: 'Newark', match: ['Newark'] },
  ],
  Brighton: [
    { name: 'Eastbourne', match: ['Eastbourne'] },
    { name: 'Worthing', match: ['Worthing'] },
    { name: 'Hastings', match: ['Hastings'] },
    { name: 'Crawley', match: ['Crawley'] },
    { name: 'Bexhill on Sea', match: ['Bexhill on Sea', 'Bexhill-on-Sea'] },
    { name: 'Lewes', match: ['Lewes'] },
  ],
  Southampton: [
    { name: 'Winchester', match: ['Winchester'] },
    { name: 'Eastleigh', match: ['Eastleigh'] },
    { name: 'Fareham', match: ['Fareham'] },
  ],
  Portsmouth: [
    { name: 'Fareham', match: ['Fareham'] },
    { name: 'Chichester', match: ['Chichester'] },
  ],
  Bournemouth: [
    { name: 'Poole', match: ['Poole'] },
    { name: 'Christchurch', match: ['Christchurch'] },
  ],
  Bristol: [
    { name: 'Weston-super-Mare', match: ['Weston-super-Mare', 'Weston super Mare'] },
  ],
  Blackpool: [
    { name: 'Lytham St Annes', match: ['Lytham St Annes', 'Lytham St. Annes'] },
    { name: 'Fleetwood', match: ['Fleetwood'] },
    { name: 'Preston', match: ['Preston'] },
    { name: 'Morecambe', match: ['Morecambe'] },
  ],
  Scarborough: [
    { name: 'Whitby', match: ['Whitby'] },
    { name: 'Bridlington', match: ['Bridlington'] },
    { name: 'Filey', match: ['Filey'] },
  ],
  Cardiff: [
    { name: 'Newport', match: ['Newport'] },
    { name: 'Barry', match: ['Barry'] },
    { name: 'Pontypridd', match: ['Pontypridd'] },
  ],
  Edinburgh: [
    { name: 'Dunfermline', match: ['Dunfermline'] },
    { name: 'Kinross', match: ['Kinross'] },
    { name: 'Bathgate', match: ['Bathgate'] },
    { name: 'Livingston', match: ['Livingston'] },
    { name: 'Musselburgh', match: ['Musselburgh'] },
  ],
  Coventry: [
    { name: 'Nuneaton', match: ['Nuneaton'] },
    { name: 'Leamington Spa', match: ['Leamington Spa', 'Royal Leamington Spa'] },
    { name: 'Warwick', match: ['Warwick'] },
    { name: 'Rugby', match: ['Rugby'] },
  ],
  Wolverhampton: [
    { name: 'Telford', match: ['Telford'] },
    { name: 'Shrewsbury', match: ['Shrewsbury'] },
    { name: 'Kidderminster', match: ['Kidderminster'] },
  ],
  'Milton Keynes': [
    { name: 'Northampton', match: ['Northampton'] },
    { name: 'Aylesbury', match: ['Aylesbury'] },
    { name: 'Bedford', match: ['Bedford'] },
    { name: 'Wellingborough', match: ['Wellingborough'] },
  ],
  Reading: [
    { name: 'Basingstoke', match: ['Basingstoke'] },
    { name: 'Newbury', match: ['Newbury'] },
  ],
  Ipswich: [
    { name: 'Colchester', match: ['Colchester'] },
  ],
  'Stoke-on-Trent': [
    { name: 'Crewe', match: ['Crewe'] },
    { name: 'Newcastle-under-Lyme', match: ['Newcastle-under-Lyme', 'Newcastle under Lyme'] },
  ],
  Exeter: [
    { name: 'Torquay', match: ['Torquay'] },
    { name: 'Paignton', match: ['Paignton'] },
    { name: 'Exmouth', match: ['Exmouth'] },
  ],
  London: [
    { name: 'Bromley', match: ['Bromley'] },
    { name: 'Croydon', match: ['Croydon'] },
    { name: 'Twickenham', match: ['Twickenham'] },
    { name: 'Watford', match: ['Watford'] },
    { name: 'Dartford', match: ['Dartford'] },
    { name: 'Kingston upon Thames', match: ['Kingston upon Thames', 'Kingston'] },
  ],
  Birmingham: [
    { name: 'Solihull', match: ['Solihull'] },
    { name: 'West Bromwich', match: ['West Bromwich'] },
    { name: 'Dudley', match: ['Dudley'] },
    { name: 'Walsall', match: ['Walsall'] },
    { name: 'Sutton Coldfield', match: ['Sutton Coldfield'] },
  ],
  Glasgow: [
    { name: 'Paisley', match: ['Paisley'] },
    { name: 'Hamilton', match: ['Hamilton'] },
    { name: 'Motherwell', match: ['Motherwell'] },
    { name: 'Falkirk', match: ['Falkirk'] },
    { name: 'East Kilbride', match: ['East Kilbride'] },
    { name: 'Clydebank', match: ['Clydebank'] },
  ],
  Liverpool: [
    { name: 'Southport', match: ['Southport'] },
    { name: 'St Helens', match: ['St Helens'] },
    { name: 'Birkenhead', match: ['Birkenhead'] },
    { name: 'Widnes', match: ['Widnes'] },
    { name: 'Chester', match: ['Chester'] },
  ],
  Belfast: [
    { name: 'Lisburn', match: ['Lisburn'] },
    { name: 'Bangor', match: ['Bangor'] },
    { name: 'Newtownabbey', match: ['Newtownabbey'] },
    { name: 'Carrickfergus', match: ['Carrickfergus'] },
  ],
  Leicester: [
    { name: 'Loughborough', match: ['Loughborough'] },
    { name: 'Hinckley', match: ['Hinckley'] },
    { name: 'Market Harborough', match: ['Market Harborough'] },
    { name: 'Melton Mowbray', match: ['Melton Mowbray'] },
  ],
  Norwich: [
    { name: 'Great Yarmouth', match: ['Great Yarmouth'] },
    { name: 'Cromer', match: ['Cromer'] },
    { name: 'Wymondham', match: ['Wymondham'] },
  ],
  Oxford: [
    { name: 'Banbury', match: ['Banbury'] },
    { name: 'Abingdon', match: ['Abingdon'] },
    { name: 'Witney', match: ['Witney'] },
    { name: 'Bicester', match: ['Bicester'] },
    { name: 'Woodstock', match: ['Woodstock'] },
  ],
  Cambridge: [
    { name: 'Ely', match: ['Ely'] },
    { name: 'Newmarket', match: ['Newmarket'] },
    { name: 'Huntingdon', match: ['Huntingdon'] },
    { name: 'Saffron Walden', match: ['Saffron Walden'] },
  ],
  Plymouth: [
    { name: 'Saltash', match: ['Saltash'] },
    { name: 'Torpoint', match: ['Torpoint'] },
    { name: 'Plympton', match: ['Plympton'] },
  ],
  Sunderland: [
    { name: 'Washington', match: ['Washington'] },
    { name: 'South Shields', match: ['South Shields'] },
    { name: 'Seaham', match: ['Seaham'] },
    { name: 'Houghton-le-Spring', match: ['Houghton-le-Spring', 'Houghton le Spring'] },
  ],
  Swansea: [
    { name: 'Neath', match: ['Neath'] },
    { name: 'Port Talbot', match: ['Port Talbot'] },
    { name: 'Llanelli', match: ['Llanelli'] },
    { name: 'Mumbles', match: ['Mumbles', 'The Mumbles'] },
    { name: 'Bridgend', match: ['Bridgend'] },
  ],
  Aberdeen: [
    { name: 'Ellon', match: ['Ellon'] },
    { name: 'Stonehaven', match: ['Stonehaven'] },
    { name: 'Inverurie', match: ['Inverurie'] },
    { name: 'Westhill', match: ['Westhill'] },
  ],
  York: [
    { name: 'Selby', match: ['Selby'] },
    { name: 'Malton', match: ['Malton'] },
    { name: 'Thirsk', match: ['Thirsk'] },
    { name: 'Harrogate', match: ['Harrogate'] },
  ],
  Bath: [
    { name: 'Keynsham', match: ['Keynsham'] },
    { name: 'Bradford on Avon', match: ['Bradford on Avon', 'Bradford-on-Avon'] },
    { name: 'Frome', match: ['Frome'] },
    { name: 'Chippenham', match: ['Chippenham'] },
    { name: 'Trowbridge', match: ['Trowbridge'] },
  ],
}

export function getNearbyAreas(cityName: string): NearbyArea[] {
  const key = Object.keys(NEARBY_AREAS).find(k => k.toLowerCase() === cityName.trim().toLowerCase())
  return key ? NEARBY_AREAS[key] : []
}

// PostgREST `or` filter value for "venue_city is one of these spellings".
// Characters that would break the filter syntax (commas, brackets, quotes,
// wildcards) are dropped from the spellings, so a stray character in the config
// can never alter the query.
export function nearbyOrFilter(areas: NearbyArea[], column = 'venue_city'): string {
  const clean = (s: string) => s.replace(/[,()*%"\\]/g, '').trim()
  const spellings = areas.flatMap(a => a.match).map(clean).filter(Boolean)
  return spellings.map(s => `${column}.ilike.${s}`).join(',')
}

// Which configured town a venue city belongs to (null when it matches none).
export function areaForVenueCity(areas: NearbyArea[], venueCity: string | null | undefined): NearbyArea | null {
  const c = (venueCity ?? '').trim().toLowerCase()
  if (!c) return null
  return areas.find(a => a.match.some(m => m.toLowerCase() === c)) ?? null
}

// The towns that actually have a show in this list, in config order, so the
// page only names places it has something for.
export function areasWithEvents(areas: NearbyArea[], events: { venue_city: string | null }[]): NearbyArea[] {
  const present = new Set<string>()
  for (const e of events) {
    const a = areaForVenueCity(areas, e.venue_city)
    if (a) present.add(a.name)
  }
  return areas.filter(a => present.has(a.name))
}

// One plain sentence for a city's intro naming the nearby towns that have shows
// on the page, or '' when there are none.
export function nearbyIntroSentence(towns: NearbyArea[]): string {
  const names = towns.map(t => t.name)
  if (!names.length) return ''
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  return `Shows in nearby ${list} are gathered further down this page.`
}
