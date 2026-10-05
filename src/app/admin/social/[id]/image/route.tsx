// Branded social-image route (Phase 7, requirement 10) — renders an
// on-demand graphic with next/og's ImageResponse. There is no file
// storage anywhere in this project (no Supabase Storage bucket, no
// Vercel Blob), so nothing is ever uploaded or persisted here: this is a
// pure render of social_packs.image_params (a small JSON "recipe") every
// time the route is hit.
//
// Five vibrant, distinct templates (src/lib/socialPack.ts's
// SOCIAL_IMAGE_KINDS/SOCIAL_IMAGE_THEMES) replace the single flat dark
// design this route used to render for every pack — tour announcements,
// onsales, presales, city-wide roundups and "tonight" posts each get
// their own gradient + accent + badge. When the pack's own event or
// artist has a photo, it's used as a full-bleed background behind a
// brand-coloured wash; otherwise the template falls back to its vibrant
// gradient alone. Either way this NEVER pulls a photo from anywhere
// other than TheShowFinder's own Ticketmaster/Live Nation/Universe
// ingestion pipeline — isApprovedImageSource is re-checked here, not
// just trusted from storage, so a row written before that gate existed
// (or edited some other way) can never paint an unapproved image.
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
import {
  SOCIAL_IMAGE_THEMES,
  resolveStoredImageKind,
  resolveApprovedImageUrl,
} from '@/lib/socialPack'

export const dynamic = 'force-dynamic'

interface RouteParams {
  params: Promise<{ id: string }>
}

async function isAdminAuthed(): Promise<boolean> {
  const store = await cookies()
  const token = store.get('admin_token')?.value
  return Boolean(token) && token === process.env.ADMIN_PASSWORD
}

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
    .single() as unknown as { data: { image_params: Record<string, unknown> } | null }

  if (!pack) {
    return new Response('Social Pack not found', { status: 404 })
  }

  const storedParams = pack.image_params ?? {}

  // Safe fallbacks for every field: a pack prepared before this template
  // system existed has no `kind`/`imageUrl` in its stored params at all,
  // and even headline/city/dateLabel are defended here rather than
  // trusted blindly, since image_params is an untyped jsonb column.
  const headline = typeof storedParams.headline === 'string' && storedParams.headline.trim()
    ? storedParams.headline
    : 'TheShowFinder'
  const city = typeof storedParams.city === 'string' && storedParams.city.trim() ? storedParams.city : null
  const dateLabel = typeof storedParams.dateLabel === 'string' && storedParams.dateLabel.trim() ? storedParams.dateLabel : null
  const kind = resolveStoredImageKind(storedParams.kind)
  const imageUrl = resolveApprovedImageUrl(storedParams.imageUrl)
  const theme = SOCIAL_IMAGE_THEMES[kind]

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
          backgroundColor: theme.gradientFrom,
            backgroundImage: imageUrl ? undefined : `radial-gradient(circle at 88% 12%, ${theme.accent}66 0%, transparent 30%), radial-gradient(circle at 8% 86%, #ffffff22 0%, transparent 26%), linear-gradient(135deg, ${theme.gradientFrom} 0%, ${theme.gradientTo} 100%)`,
          fontFamily: 'sans-serif',
        }}
      >
        {imageUrl && (
          // An approved event/artist photo as a full-bleed background.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt=""
            width={width}
            height={height}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'flex' }}
          />
        )}

        {/* Legibility wash in the template's own colours over a photo
            background; a soft darkening gradient (no photo to wash) when
            the template is already the vibrant gradient on its own. */}
        <div
          style={{
            position: 'absolute', top: 0, left: 0,
            width: '100%', height: '100%',
            display: 'flex',
            backgroundImage: imageUrl
              ? `linear-gradient(135deg, ${theme.gradientFrom}66 0%, transparent 42%), linear-gradient(180deg, #00000022 0%, #000000b8 100%)`
              : 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.18) 100%)',
          }}
        />

        {/* Bright visual anchors keep the card recognisable in a fast feed,
            even when a source photo is unavailable. */}
        <div style={{ position: 'absolute', top: -170, right: -130, width: 520, height: 520, borderRadius: 999, backgroundColor: `${theme.accent}33`, display: 'flex', transform: 'rotate(18deg)' }} />
        <div style={{ position: 'absolute', top: 250, right: -240, width: 760, height: 70, backgroundColor: `${theme.accent}cc`, display: 'flex', transform: 'rotate(-24deg)' }} />
        <div style={{ position: 'absolute', bottom: 210, left: -260, width: 760, height: 54, backgroundColor: '#ffffff22', display: 'flex', transform: 'rotate(-24deg)' }} />
        <div
          style={{
            position: 'absolute',
            top: format === 'vertical' ? 250 : 170,
            right: -24,
            display: 'flex',
            color: `${theme.accent}55`,
            fontSize: format === 'vertical' ? 260 : 190,
            fontWeight: 900,
            letterSpacing: -12,
            transform: 'rotate(-8deg)',
          }}
        >
          SHOW
        </div>

        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            padding: 64,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span style={{ color: '#ffffff', fontSize: 30, fontWeight: 800, letterSpacing: 2 }}>THE</span>
            <span style={{ color: theme.accent, fontSize: 30, fontWeight: 800, letterSpacing: 2 }}>SHOWFINDER</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginTop: 'auto' }}>
            <div
              style={{
                display: 'flex',
                alignSelf: 'flex-start',
                backgroundColor: theme.accent,
                color: '#111111',
                fontSize: 26,
                fontWeight: 800,
                letterSpacing: 3,
                textTransform: 'uppercase',
                padding: '10px 22px',
                borderRadius: 999,
              }}
            >
              {theme.badgeLabel}
            </div>

            {city && (
              <div
                style={{
                  display: 'flex',
                  alignSelf: 'flex-start',
                  backgroundColor: 'rgba(255,255,255,0.16)',
                  color: '#ffffff',
                  fontSize: 26,
                  fontWeight: 700,
                  letterSpacing: 2,
                  textTransform: 'uppercase',
                  padding: '8px 20px',
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
                fontSize: headline.length > 60 ? 58 : 94,
                fontWeight: 800,
                lineHeight: 1.04,
                maxWidth: 920,
                textShadow: '0 4px 18px rgba(0,0,0,0.35)',
                borderLeft: `14px solid ${theme.accent}`,
                paddingLeft: 26,
              }}
            >
              {headline}
            </div>

            {dateLabel && (
              <div style={{ display: 'flex', color: '#ffffff', fontSize: 34, fontWeight: 600, opacity: 0.85 }}>
                {dateLabel}
              </div>
            )}

          </div>

          <div style={{ display: 'flex', marginTop: 40, color: '#ffffff', fontSize: 24, fontWeight: 600, opacity: 0.7 }}>
            theshowfinder.com
          </div>
        </div>
      </div>
    ),
    { width, height },
  )
}
