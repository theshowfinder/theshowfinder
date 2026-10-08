import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { syncGigsbergCatalogue } from '@/lib/gigsbergCatalogue'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function GET() {
  await requireAdmin()

  try {
    const result = await syncGigsbergCatalogue()
    const url = new URL('/admin/gigsberg', process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.theshowfinder.com')
    url.searchParams.set('synced', String(result.fetched))
    url.searchParams.set('updated', String(result.updated))
    return NextResponse.redirect(url)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The catalogue import failed.'
    const url = new URL('/admin/gigsberg', process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.theshowfinder.com')
    url.searchParams.set('syncError', message)
    return NextResponse.redirect(url)
  }
}
