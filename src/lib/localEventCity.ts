import { CITIES } from './cities.ts'
import { getNearbyAreas } from './nearbyAreas.ts'

// Approximate city-centre coordinates for the 40 cities, used to file a scraped event under the city it is really in.
export const CITY_CENTRES: Record<string, [number, number]> = {
  London: [51.5074, -0.1278], Manchester: [53.4808, -2.2426], Birmingham: [52.4862, -1.8904], Glasgow: [55.8642, -4.2518],
  Edinburgh: [55.9533, -3.1883], Leeds: [53.8008, -1.5491], Liverpool: [53.4084, -2.9916], Bristol: [51.4545, -2.5879],
  Cardiff: [51.4816, -3.1791], Belfast: [54.5973, -5.9301], Nottingham: [52.9548, -1.1581], Newcastle: [54.9783, -1.6178],
  Leicester: [52.6369, -1.1398], Sheffield: [53.3811, -1.4701], Derby: [52.9225, -1.4746], Coventry: [52.4068, -1.5197],
  Southampton: [50.9097, -1.4044], Portsmouth: [50.8198, -1.0880], Norwich: [52.6309, 1.2974], Brighton: [50.8225, -0.1372],
  Oxford: [51.7520, -1.2577], Cambridge: [52.2053, 0.1218], Exeter: [50.7184, -3.5339], Plymouth: [50.3755, -4.1427],
  Hull: [53.7676, -0.3274], Middlesbrough: [54.5742, -1.2350], Sunderland: [54.9069, -1.3838], Bradford: [53.7960, -1.7594],
  Reading: [51.4543, -0.9781], 'Milton Keynes': [52.0406, -0.7594], Bournemouth: [50.7192, -1.8808], Ipswich: [52.0567, 1.1482],
  'Stoke-on-Trent': [53.0027, -2.1794], Wolverhampton: [52.5870, -2.1288], Swansea: [51.6214, -3.9436], Aberdeen: [57.1497, -2.0943],
  York: [53.9591, -1.0815], Blackpool: [53.8175, -3.0357], Scarborough: [54.2831, -0.4044], Bath: [51.3811, -2.3590],
}

/** A point inside a city's own boundary, in km. Beyond this the event belongs to a town, not the city. */
export const CITY_RADIUS_KM = 20
/** An event further than this from every city and from its own source city is not ours to show. */
export const SOURCE_REACH_KM = 45

export function distanceKm(a: [number, number], b: [number, number]): number {
  const rad = Math.PI / 180
  const dLat = (b[0] - a[0]) * rad, dLng = (b[1] - a[1]) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

function nearestCity(lat: number, lng: number): { name: string; km: number } {
  let best = { name: '', km: Infinity }
  for (const [name, c] of Object.entries(CITY_CENTRES)) {
    const km = distanceKm([lat, lng], c)
    if (km < best.km) best = { name, km }
  }
  return best
}

/**
 * Which city a scraped local event belongs to, or null when it is too far from everything to show.
 * A tourist board lists its whole region, and the page markup is often thin: no address, or a suburb or village as the
 * "locality". City pages match on the venue's city, so:
 *  1. coordinates win: the nearest of our 40 cities within 20 km (a Visit Birmingham listing for the Belgrade Theatre is a
 *     Coventry event), otherwise the source city if within 45 km, otherwise null;
 *  2. with no coordinates, a locality that is one of our cities, or one of the source city's nearby towns, is kept;
 *  3. anything else (suburb, village, nothing) is filed under the source's own city.
 */
export function resolveEventCity(
  locality: string | null | undefined,
  sourceCity: string,
  geo?: { lat: number | null; lng: number | null } | null,
): string | null {
  const loc = (locality ?? '').trim()
  const lower = loc.toLowerCase()

  if (geo && geo.lat != null && geo.lng != null && Number.isFinite(geo.lat) && Number.isFinite(geo.lng) && !(geo.lat === 0 && geo.lng === 0)) {
    const near = nearestCity(geo.lat, geo.lng)
    if (near.km <= CITY_RADIUS_KM) return near.name
    const nearby = loc && getNearbyAreas(sourceCity).find(a => a.match.some(m => m.toLowerCase() === lower))
    if (nearby) return nearby.match[0]
    const src = CITY_CENTRES[sourceCity]
    if (src && distanceKm([geo.lat, geo.lng], src) <= SOURCE_REACH_KM) return sourceCity
    return null
  }

  if (!loc) return sourceCity
  if (lower === sourceCity.toLowerCase()) return sourceCity
  const asCity = CITIES.find(c => c.name.toLowerCase() === lower)
  if (asCity) return asCity.name
  const nearby = getNearbyAreas(sourceCity).find(a => a.match.some(m => m.toLowerCase() === lower))
  if (nearby) return nearby.match[0]
  return sourceCity
}
