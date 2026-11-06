import type { LocalBusiness } from '@/lib/types/database'
import { FEATURED_PER_AREA, STANDARD_PER_AREA, groupByArea, type AreaVenue } from './localPlacements.ts'

// Kept for older imports: the caps now apply per area (everything within walking distance), not per city.
export const FEATURED_BUSINESS_LIMIT = FEATURED_PER_AREA
export const STANDARD_BUSINESS_LIMIT = STANDARD_PER_AREA

export interface AreaPlacements { label: string; featured: LocalBusiness[]; standard: LocalBusiness[] }

/**
 * City-page partners grouped by area ("Near The O2", "Near O2 Academy Brixton", "Around London"), at most three
 * Featured and six Standard per area. `venues` (biggest first, with map positions) name the areas; with none, or
 * for partners without a postcode, everything sits in one "Around <city>" group, which is the old city-wide layout.
 */
export function selectLocalBusinessPlacements(businesses: LocalBusiness[], venues: readonly AreaVenue[] = [], city = '') {
  const groups: AreaPlacements[] = groupByArea(businesses, venues, city).map(g => ({
    label: g.label,
    featured: g.items.filter(b => b.is_sponsored).slice(0, FEATURED_PER_AREA),
    standard: g.items.filter(b => !b.is_sponsored).slice(0, STANDARD_PER_AREA),
  })).filter(g => g.featured.length || g.standard.length)
  return {
    groups,
    featured: groups.flatMap(g => g.featured),
    standard: groups.flatMap(g => g.standard),
  }
}
