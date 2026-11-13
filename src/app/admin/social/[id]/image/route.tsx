// Branded social-image route: renders a post graphic on demand with next/og's ImageResponse.
//
// Design (6 Nov 2026, replaces the generic-background template): the act's own photo full-bleed at the top, the act's
// name in huge condensed type, the news in one line under it, a coloured sticker per post type (Just Announced red,
// On Sale yellow, Presale purple, Tonight orange, city round-ups teal), our logo top-left and a brand-red ticket-stub
// footer with the web address, because Facebook posts cannot carry links.
//
// The only photo it can ever use is the pack's stored imageUrl, and only when it passes resolveApprovedImageUrl (our
// licensed Ticketmaster / Live Nation ingestion hosts). It is fetched server-side and embedded as data; the design
// never scrapes or copies third-party article imagery. With no approved photo (or if the fetch fails) it falls back to
// the local concert background, and below that a branded gradient.
//
// ?format=square   -> 1080x1080 (Facebook / Instagram feed)
// ?format=vertical -> 1080x1920 (Instagram Story / TikTok)
// ?platform=facebook -> footer says "SEARCH THESHOWFINDER" instead of "LINK IN BIO" (Facebook has no bio link).
//
// Auth is checked inline (not via requireAdmin, which redirects) so an unauthenticated request gets a plain 401.

import { ImageResponse } from 'next/og'
import { cookies } from 'next/headers'
import type { NextRequest } from 'next/server'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  SOCIAL_BRAND_RED,
  SOCIAL_IMAGE_THEMES,
  resolveApprovedImageUrl,
  resolveStoredImageKind,
  splitSocialHeadline,
} from '@/lib/socialPack'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface RouteParams {
  params: Promise<{ id: string }>
}

async function isAdminAuthed(): Promise<boolean> {
  const store = await cookies()
  const token = store.get('admin_token')?.value
  return Boolean(token) && token === process.env.ADMIN_PASSWORD
}

async function readConcertBackground(): Promise<string | null> {
  try {
    const file = await readFile(path.join(process.cwd(), 'public/social-backgrounds/concert-cinematic-v2.png'))
    return `data:image/png;base64,${file.toString('base64')}`
  } catch {
    return null
  }
}

// The act's photo, embedded as data so the renderer never fetches it itself. Approved hosts only (checked by the caller).
async function readApprovedPhoto(url: string): Promise<string | null> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000)
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timer)
    const type = res.headers.get('content-type') ?? ''
    if (!res.ok || !/^image\/(jpeg|png|webp)/.test(type)) return null
    return `data:${type.split(';')[0]};base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`
  } catch {
    return null
  }
}

async function readFonts() {
  // Literal paths so the deployment bundles the font files with this function.
  try {
    const [anton, inter800, inter900] = await Promise.all([
      readFile(path.join(process.cwd(), 'public/fonts/social/anton-latin-400-normal.woff')),
      readFile(path.join(process.cwd(), 'public/fonts/social/inter-latin-800-normal.woff')),
      readFile(path.join(process.cwd(), 'public/fonts/social/inter-latin-900-normal.woff')),
    ])
    return [
      { name: 'Anton', data: anton, weight: 400 as const, style: 'normal' as const },
      { name: 'Inter', data: inter800, weight: 800 as const, style: 'normal' as const },
      { name: 'Inter', data: inter900, weight: 900 as const, style: 'normal' as const },
    ]
  } catch {
    return undefined
  }
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  if (!(await isAdminAuthed())) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { id } = await params
  const format = request.nextUrl.searchParams.get('format') === 'vertical' ? 'vertical' : 'square'
  const platform = request.nextUrl.searchParams.get('platform') === 'facebook' ? 'facebook' : 'instagram'
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

  const headline = typeof storedParams.headline === 'string' && storedParams.headline.trim()
    ? storedParams.headline
    : 'TheShowFinder'
  const city = typeof storedParams.city === 'string' && storedParams.city.trim() ? storedParams.city : null
  const dateLabel = typeof storedParams.dateLabel === 'string' && storedParams.dateLabel.trim() ? storedParams.dateLabel : null
  const kind = resolveStoredImageKind(storedParams.kind)
  const theme = SOCIAL_IMAGE_THEMES[kind]
  const approvedPhoto = resolveApprovedImageUrl(storedParams.imageUrl)

  const [photo, concertBackground, fonts] = await Promise.all([
    approvedPhoto ? readApprovedPhoto(approvedPhoto) : Promise.resolve(null),
    readConcertBackground(),
    readFonts(),
  ])
  const background = photo ?? concertBackground

  // List posts (on sale this week, this weekend, featured partner): a heading and up to six rows instead of one act.
  const list = Array.isArray(storedParams.list)
    ? (storedParams.list as Array<{ title?: unknown; line?: unknown }>).filter(i => typeof i?.title === 'string').slice(0, format === 'vertical' ? 8 : 5)
        .map(i => ({ title: String(i.title), line: typeof i.line === 'string' ? i.line : '' }))
    : []
  if (list.length) {
    const perforationL = Array.from({ length: 27 }, (_, i) => i)
    const rowTitle = list.length <= 3 ? 64 : 46
    return new ImageResponse(
      (
        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', position: 'relative', backgroundColor: '#0B0B14', backgroundImage: `linear-gradient(160deg, ${theme.gradientFrom} 0%, ${theme.gradientTo} 100%)`, fontFamily: 'Inter' }}>
          {background && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={background} alt="" width={width} height={height} style={{ position: 'absolute', top: 0, left: 0, width, height, objectFit: 'cover', opacity: 0.18 }} />
          )}
          <div style={{ position: 'absolute', top: 44, left: 48, right: 48, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#ffffff', borderRadius: 14, padding: '12px 20px' }}>
              <span style={{ fontFamily: 'Anton', fontSize: 40, color: '#0B0B14', letterSpacing: 1 }}>THE</span>
              <span style={{ fontFamily: 'Anton', fontSize: 40, color: SOCIAL_BRAND_RED, letterSpacing: 1 }}>SHOWFINDER</span>
            </div>
            <div style={{ display: 'flex', backgroundColor: theme.badgeBg, color: theme.badgeFg, fontWeight: 900, fontSize: 28, letterSpacing: 3, padding: '14px 24px', borderRadius: 12, transform: 'rotate(3deg)' }}>{theme.badgeLabel}</div>
          </div>
          <div style={{ position: 'absolute', top: 170, left: 56, right: 56, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', width: 120, height: 12, backgroundColor: theme.badgeBg, marginBottom: 20 }} />
            <div style={{ display: 'flex', fontFamily: 'Anton', fontSize: headline.length <= 18 ? 96 : 76, lineHeight: 1.02, color: '#ffffff', textTransform: 'uppercase' }}>{headline}</div>
            <div style={{ display: 'flex', flexDirection: 'column', marginTop: 34 }}>
              {list.map((item, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', padding: '11px 0', borderTop: i === 0 ? 'none' : '2px solid rgba(255,255,255,0.15)' }}>
                  <span style={{ display: 'flex', fontFamily: 'Anton', fontSize: rowTitle, color: '#ffffff', textTransform: 'uppercase', lineHeight: 1.05 }}>{item.title}</span>
                  {item.line && <span style={{ display: 'flex', fontWeight: 800, fontSize: 28, color: theme.accent, marginTop: 4 }}>{item.line}</span>}
                </div>
              ))}
            </div>
          </div>
          <div style={{ position: 'absolute', left: 0, bottom: 0, width, height: 130, backgroundColor: SOCIAL_BRAND_RED, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 56px' }}>
            <div style={{ position: 'absolute', top: -9, left: 12, right: 12, display: 'flex', justifyContent: 'space-between' }}>
              {perforationL.map(i => <div key={i} style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#0B0B14', display: 'flex' }} />)}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontWeight: 900, fontSize: 22, letterSpacing: 4, color: '#FFE3EA' }}>FIND TICKETS AT</span>
              <span style={{ fontFamily: 'Anton', fontSize: 52, color: '#ffffff', letterSpacing: 1 }}>THESHOWFINDER.COM</span>
            </div>
            <div style={{ display: 'flex', backgroundColor: '#ffffff', color: SOCIAL_BRAND_RED, fontWeight: 900, fontSize: 26, padding: '14px 22px', borderRadius: 999 }}>{platform === 'facebook' ? 'SEARCH THESHOWFINDER' : 'LINK IN BIO ›'}</div>
          </div>
        </div>
      ),
      { width, height, fonts },
    )
  }

  const { title, detail } = splitSocialHeadline(headline)
  const titleSize = title.length <= 10 ? 170 : title.length <= 16 ? 130 : title.length <= 24 ? 100 : title.length <= 40 ? 78 : 62
  const photoHeight = format === 'vertical' ? 1450 : 640
  const chips = [city, dateLabel].filter((c): c is string => Boolean(c))
  const footerCta = platform === 'facebook' ? 'SEARCH THESHOWFINDER' : 'LINK IN BIO ›'
  const perforation = Array.from({ length: 27 }, (_, i) => i)

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          backgroundColor: '#0B0B14',
          backgroundImage: `linear-gradient(135deg, ${theme.gradientFrom} 0%, ${theme.gradientTo} 100%)`,
          fontFamily: 'Inter',
        }}
      >
        {/* The photo (or the local concert background), fading into the dark text panel. */}
        <div style={{ position: 'absolute', top: 0, left: 0, width, height: photoHeight, display: 'flex' }}>
          {background && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={background} alt="" width={width} height={photoHeight} style={{ width, height: photoHeight, objectFit: 'cover', objectPosition: 'center 25%' }} />
          )}
          <div style={{ position: 'absolute', top: 0, left: 0, width, height: photoHeight, display: 'flex', backgroundImage: 'linear-gradient(180deg, rgba(11,11,20,0.55) 0%, rgba(11,11,20,0) 22%, rgba(11,11,20,0) 55%, rgba(11,11,20,1) 100%)' }} />
        </div>
        <div style={{ position: 'absolute', top: photoHeight, left: 0, width, height: height - photoHeight, display: 'flex', backgroundColor: '#0B0B14' }} />

        {/* Logo and the post-type sticker. */}
        <div style={{ position: 'absolute', top: 44, left: 48, right: 48, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#ffffff', borderRadius: 14, padding: '12px 20px', boxShadow: '0 6px 20px rgba(0,0,0,0.35)' }}>
            <span style={{ fontFamily: 'Anton', fontSize: 40, color: '#0B0B14', letterSpacing: 1 }}>THE</span>
            <span style={{ fontFamily: 'Anton', fontSize: 40, color: SOCIAL_BRAND_RED, letterSpacing: 1 }}>SHOWFINDER</span>
          </div>
          <div style={{ display: 'flex', backgroundColor: theme.badgeBg, color: theme.badgeFg, fontWeight: 900, fontSize: 30, letterSpacing: 3, padding: '14px 26px', borderRadius: 12, transform: 'rotate(3deg)', boxShadow: '0 6px 20px rgba(0,0,0,0.35)' }}>
            {theme.badgeLabel}
          </div>
        </div>

        {/* The act in huge type, the news underneath, then city / date chips. */}
        <div style={{ position: 'absolute', left: 56, right: 56, bottom: 170, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', width: 120, height: 12, backgroundColor: theme.badgeBg, marginBottom: 22 }} />
          <div style={{ display: 'flex', flexWrap: 'wrap', fontFamily: 'Anton', fontSize: titleSize, lineHeight: 1.02, color: '#ffffff', textTransform: 'uppercase', letterSpacing: 1 }}>
            {title}
          </div>
          {detail && (
            <div style={{ display: 'flex', fontWeight: 900, fontSize: 40, color: '#ffffff', marginTop: 18, lineHeight: 1.2 }}>
              {detail}
            </div>
          )}
          {chips.length > 0 && (
            <div style={{ display: 'flex', marginTop: 24 }}>
              {chips.map(chip => (
                <div key={chip} style={{ display: 'flex', border: '3px solid rgba(255,255,255,0.85)', color: '#ffffff', fontWeight: 800, fontSize: 28, padding: '8px 18px', borderRadius: 999, marginRight: 14 }}>
                  {chip}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Ticket-stub footer: the web address does the work a link would. */}
        <div style={{ position: 'absolute', left: 0, bottom: 0, width, height: 130, backgroundColor: SOCIAL_BRAND_RED, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 56px' }}>
          <div style={{ position: 'absolute', top: -9, left: 12, right: 12, display: 'flex', justifyContent: 'space-between' }}>
            {perforation.map(i => <div key={i} style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#0B0B14', display: 'flex' }} />)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontWeight: 900, fontSize: 22, letterSpacing: 4, color: '#FFE3EA' }}>FIND TICKETS AT</span>
            <span style={{ fontFamily: 'Anton', fontSize: 52, color: '#ffffff', letterSpacing: 1 }}>THESHOWFINDER.COM</span>
          </div>
          <div style={{ display: 'flex', backgroundColor: '#ffffff', color: SOCIAL_BRAND_RED, fontWeight: 900, fontSize: 26, padding: '14px 22px', borderRadius: 999 }}>
            {footerCta}
          </div>
        </div>
      </div>
    ),
    { width, height, fonts },
  )
}
