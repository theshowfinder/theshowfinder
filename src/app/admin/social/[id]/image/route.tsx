// Branded social-image route (Phase 7, requirement 10) — renders an
// on-demand graphic with next/og's ImageResponse. There is no file
// storage anywhere in this project (no Supabase Storage bucket, no
// Vercel Blob), so nothing is ever uploaded or persisted here: this is a
// pure render of social_packs.image_params (a small JSON "recipe" —
// headline/city/dateLabel) every time the route is hit. It NEVER pulls a
// photo from Ticketmaster, a venue, or a third-party article — the image
// is always this branded TheShowFinder graphic, satisfying "if no safe
// image exists, use a branded graphic containing the headline, city,
// artist/event and date." No ticket-availability claim is ever rendered
// here, matching the Tonight/ticket-link wording rules elsewhere.
//
// ?format=square  → 1080x1080  (Facebook / Instagram feed)
// ?format=vertical → 1080x1920 (Instagram Story / TikTok)
// Defaults to square when the param is missing or unrecognised.
//
// Auth is checked inline (not via requireAdmin, which calls next/navigation's
// redirect() — meant for pages/actions, not Route Handlers serving an
// <img src>) so an unauthenticated request gets a plain 401 rather than a
// redirect to an HTML login page, which would just render as a broken image.

import { ImageResponse } from 'next/og'
import { cookies } from 'next/headers'
import type { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SocialImageParams } from '@/lib/socialPack'

export const dynamic = 'force-dynamic'

interface RouteParams {
  params: Promise<{ id: string }>
}

async function isAdminAuthed(): Promise<boolean> {
  const store = await cookies()
  const token = store.get('admin_token')?.value
  return Boolean(token) && token === process.env.ADMIN_PASSWORD
}

const BRAND_RED = '#E8003D'

export async function GET(request: NextRequest, { params }: RouteParams) {
  if (!(await isAdminAuthed())) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { id } = await params
  const format = request.nextUrl.searchParams.get('format') === 'vertical' ? 'vertical' : 'square'
  const width = 1080
  const height = format === 'vertical' ? 1920 : 1080

  const db = createAdminClient()
  const { data: pack } = await db
    .from('social_packs')
    .select('image_params')
    .eq('id', id)
    .single() as unknown as { data: { image_params: SocialImageParams } | null }

  if (!pack) {
    return new Response('Social Pack not found', { status: 404 })
  }

  const { headline, city, dateLabel } = pack.image_params

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#0f172a',
          padding: 64,
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', width: 56, height: 8, backgroundColor: BRAND_RED, borderRadius: 4, marginBottom: 48 }} />

        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 'auto' }}>
          <span style={{ color: '#ffffff', fontSize: 30, fontWeight: 800, letterSpacing: 2 }}>THE</span>
          <span style={{ color: BRAND_RED, fontSize: 30, fontWeight: 800, letterSpacing: 2 }}>SHOWFINDER</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {city && (
            <div
              style={{
                display: 'flex',
                alignSelf: 'flex-start',
                backgroundColor: BRAND_RED,
                color: '#ffffff',
                fontSize: 28,
                fontWeight: 700,
                letterSpacing: 3,
                textTransform: 'uppercase',
                padding: '10px 24px',
                borderRadius: 999,
              }}
            >
              {city}
            </div>
          )}

          <div
            style={{
              display: 'flex',
              color: '#ffffff',
              fontSize: headline.length > 60 ? 56 : 72,
              fontWeight: 800,
              lineHeight: 1.15,
              maxWidth: 900,
            }}
          >
            {headline}
          </div>

          {dateLabel && (
            <div style={{ display: 'flex', color: '#94a3b8', fontSize: 34, fontWeight: 600 }}>
              {dateLabel}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', marginTop: 48, color: '#64748b', fontSize: 24, fontWeight: 600 }}>
          theshowfinder.com
        </div>
      </div>
    ),
    { width, height },
  )
}
