import type { LocalBusiness } from '@/lib/types/database'

export const FEATURED_BUSINESS_LIMIT = 3
export const STANDARD_BUSINESS_LIMIT = 6

export function selectLocalBusinessPlacements(businesses: LocalBusiness[]) {
  return {
    featured: businesses.filter(business => business.is_sponsored).slice(0, FEATURED_BUSINESS_LIMIT),
    standard: businesses.filter(business => !business.is_sponsored).slice(0, STANDARD_BUSINESS_LIMIT),
  }
}
