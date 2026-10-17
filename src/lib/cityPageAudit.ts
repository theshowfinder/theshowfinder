// Static (no database) part of the city-page audit: the 40 city pages must
// each have a unique, city-specific title and description, a hero image that
// exists on disk, a written local introduction and nearby-area entries.
// Data-dependent criteria (event count, venues, categories) are checked
// against the live database by the audit run described in the PR notes; the
// template-level criteria (breadcrumbs, structured data, internal links) are
// asserted in cityPageAudit.test.ts by reading the page source.

import { CITIES } from './cities.ts'
import { cityPageTitle, cityPageDescription, cityCanonicalUrl } from './citySeo.ts'
import { CITY_GUIDE_INTROS } from './cityGuides.ts'
import { CITY_HERO_IMAGES } from './cityHeroImages.ts'
import { NEARBY_AREAS } from './nearbyAreas.ts'

export interface CityAuditRow {
  city: string
  failures: string[]
}

export const MIN_INTRO_CHARS = 200

export function auditCityStatic(fileExists: (publicPath: string) => boolean): CityAuditRow[] {
  const titles = new Map<string, number>()
  const descs = new Map<string, number>()
  for (const { name } of CITIES) {
    const t = cityPageTitle(name)
    const d = cityPageDescription(name, 120)
    titles.set(t, (titles.get(t) ?? 0) + 1)
    descs.set(d, (descs.get(d) ?? 0) + 1)
  }
  return CITIES.map(({ name }) => {
    const failures: string[] = []
    const title = cityPageTitle(name)
    const desc = cityPageDescription(name, 120)
    if (titles.get(title) !== 1) failures.push('title not unique')
    if (!title.includes(name)) failures.push('title missing city name')
    if (descs.get(desc) !== 1) failures.push('description not unique')
    if (!desc.includes(name)) failures.push('description missing city name')
    if (!cityCanonicalUrl(name).endsWith(`/cities/${encodeURIComponent(name)}`)) failures.push('canonical url wrong')
    const hero = CITY_HERO_IMAGES[name]
    if (!hero) failures.push('no hero image configured')
    else if (!fileExists(hero)) failures.push(`hero image file missing (${hero})`)
    const intro = CITY_GUIDE_INTROS[name]
    if (!intro || intro.length < MIN_INTRO_CHARS) failures.push('local introduction missing or too short')
    if (!(NEARBY_AREAS[name]?.length > 0)) failures.push('no nearby areas defined')
    return { city: name, failures }
  })
}
