import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { CITIES } from '@/lib/cities'

// Matches Vercel's IP-geolocation header (added automatically by Vercel's
// edge network on every request in production/preview — absent locally) to
// one of the 36 UK cities the site actually has a page for, and stashes it
// in a cookie that the homepage's client-side location banner reads to
// surface "see what's on in <city>" instead of a generic homepage. Exact
// case-insensitive name match only, no nearest-city fallback — good enough
// for "someone visiting from Derby sees a Derby link" without pulling in a
// geo-distance dependency for a first version.
export function middleware(request: NextRequest) {
  const response = NextResponse.next()

  const rawCity = request.headers.get('x-vercel-ip-city')
  if (!rawCity) return response

  let decoded: string
  try {
    decoded = decodeURIComponent(rawCity)
  } catch {
    return response
  }

  const match = CITIES.find(c => c.name.toLowerCase() === decoded.toLowerCase())
  if (!match) return response

  response.cookies.set('tsf_city', match.name, {
    maxAge: 60 * 60 * 24 * 30, // 30 days
    sameSite: 'lax',
    path: '/',
  })

  return response
}

export const config = {
  // Runs on ordinary page loads only — excludes static assets, images and
  // API/cron routes, none of which ever render the location banner.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:png|jpg|jpeg|svg|ico|webp|css|js)$).*)'],
}
