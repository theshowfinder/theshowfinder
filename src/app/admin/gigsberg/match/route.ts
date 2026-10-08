import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { matchGigsbergCatalogue } from '@/lib/gigsbergMatching'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function GET() {
  await requireAdmin()

  try {
    const result = await matchGigsbergCatalogue()
    const url = new URL('/admin/gigsberg/matches', process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.theshowfinder.com')
    url.searchParams.set('checked', String(result.checked))
    url.searchParams.set('matched', String(result.autoMatched))
    url.searchParams.set('review', String(result.review))
    url.searchParams.set('noMatch', String(result.noMatch))
    url.searchParams.set('errors', String(result.errors))
    return NextResponse.redirect(url)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The matching run failed.'
    const url = new URL('/admin/gigsberg/matches', process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.theshowfinder.com')
    url.searchParams.set('error', message)
    return NextResponse.redirect(url)
  }
}
