// QR vouchers for advertiser offers (rules in businessOffers.ts, tables in migration 095).
// A visitor claims a voucher from an ad -> /voucher/<code> shows the code and a QR -> restaurant staff scan it ->
// /redeem/<code> asks for the restaurant's 4-digit PIN and marks it used. Server only (service role).
import { createHash, randomBytes } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { makeVoucherCode, makePin, voucherWindow, tidyOffer, tidyPostcode, MAX_PIN_FAILURES, voucherState } from '@/lib/businessOffers'
import { ukDate } from '@/lib/ukTime'

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = () => createAdminClient() as any
const rand = (n: number) => new Uint8Array(randomBytes(n))

export const SITE = 'https://www.theshowfinder.com'
export const newPin = () => makePin(rand)

/** One-way key for "this visitor, this business, today" (the one-voucher-a-day limit). No IP is stored. */
export function clientKey(headers: Headers, businessId: string): string {
  const ip = (headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || headers.get('x-real-ip') || ''
  const ua = headers.get('user-agent') ?? ''
  return createHash('sha256').update(`${ip}|${ua}|${businessId}|${ukDate()}`).digest('hex').slice(0, 32)
}

export interface VoucherView {
  code: string
  offer_text: string
  valid_from: string
  expires_at: string
  redeemed_at: string | null
  pin_failures: number
  source: 'event' | 'city'
  business: { id: string; name: string; city: string; logo_url: string | null; address: string | null; postcode: string | null; booking_url: string | null; website_url: string | null }
  event: { title: string; slug: string; start_date: string } | null
}

/**
 * Claims a voucher for a live business that has an offer. Same visitor, same business, same day (and same show)
 * gets the voucher they already have rather than a new one.
 */
export async function claimVoucher(businessId: string, eventId: string | null, key: string): Promise<{ code: string } | { error: string }> {
  const d = db()
  const { data: biz } = await d.from('local_businesses').select('id, offer_text, status, active_until').eq('id', businessId).maybeSingle()
  const offer = tidyOffer(biz?.offer_text)
  if (!biz || biz.status !== 'active' || (biz.active_until && new Date(biz.active_until) < new Date()) || !offer) return { error: 'This offer is no longer available.' }

  let event: { id: string; start_date: string } | null = null
  if (eventId) {
    const { data } = await d.from('events').select('id, start_date').eq('id', eventId).maybeSingle()
    if (data && new Date(data.start_date).getTime() > Date.now() - 12 * 3600_000) event = data
  }

  let q = d.from('business_vouchers').select('code').eq('business_id', businessId).eq('client_key', key).is('redeemed_at', null)
  q = event ? q.eq('event_id', event.id) : q.is('event_id', null)
  const { data: existing } = await q.order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (existing?.code) return { code: existing.code }

  const window = voucherWindow(new Date(), event?.start_date ?? null)
  for (let attempt = 0; attempt < 4; attempt++) {
    const code = makeVoucherCode(rand)
    const { error } = await d.from('business_vouchers').insert({
      code, business_id: businessId, event_id: event?.id ?? null, source: event ? 'event' : 'city',
      offer_text: offer, valid_from: window.validFrom, expires_at: window.expiresAt, client_key: key,
    })
    if (!error) return { code }
    if (!/duplicate|unique/i.test(error.message)) { console.error('[voucher] claim failed', error.message); break }
  }
  return { error: 'We could not create your voucher. Please try again.' }
}

export async function loadVoucher(code: string): Promise<VoucherView | null> {
  const { data } = await db().from('business_vouchers')
    .select('code, offer_text, valid_from, expires_at, redeemed_at, pin_failures, source, business:local_businesses(id, name, city, logo_url, address, postcode, booking_url, website_url), event:events(title, slug, start_date)')
    .eq('code', code).maybeSingle()
  return (data as VoucherView | null) ?? null
}

export type RedeemResult = { ok: true; redeemedAt: string } | { ok: false; reason: 'wrong-pin' | 'locked' | 'used' | 'expired' | 'not-yet' | 'missing'; triesLeft?: number }

/** Staff enter the restaurant's PIN; right PIN + valid voucher marks it used (only once, even with two phones). */
export async function redeemVoucher(code: string, pin: string): Promise<RedeemResult> {
  const d = db()
  const { data: v } = await d.from('business_vouchers').select('id, business_id, valid_from, expires_at, redeemed_at, pin_failures').eq('code', code).maybeSingle()
  if (!v) return { ok: false, reason: 'missing' }
  const state = voucherState(v, new Date())
  if (state !== 'valid') return { ok: false, reason: state }
  const { data: acc } = await d.from('local_business_accounts').select('redeem_pin').eq('business_id', v.business_id).maybeSingle()
  if (!acc?.redeem_pin || acc.redeem_pin !== pin.trim()) {
    const failures = v.pin_failures + 1
    await d.from('business_vouchers').update({ pin_failures: failures }).eq('id', v.id)
    return failures >= MAX_PIN_FAILURES ? { ok: false, reason: 'locked' } : { ok: false, reason: 'wrong-pin', triesLeft: MAX_PIN_FAILURES - failures }
  }
  const redeemedAt = new Date().toISOString()
  const { data: done } = await d.from('business_vouchers').update({ redeemed_at: redeemedAt }).eq('id', v.id).is('redeemed_at', null).select('id').maybeSingle()
  return done ? { ok: true, redeemedAt } : { ok: false, reason: 'used' }
}

export async function saveVoucherEmail(code: string, email: string) {
  await db().from('business_vouchers').update({ email }).eq('code', code)
}

/** Postcode -> map position via postcodes.io (free UK service, no key). Null when it can't be found. */
export async function geocodePostcode(raw: string | null | undefined): Promise<{ postcode: string; lat: number; lng: number } | null> {
  const postcode = tidyPostcode(raw)
  if (!postcode) return null
  try {
    const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}`, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    const json = await res.json() as { result?: { latitude?: number; longitude?: number } }
    const lat = json.result?.latitude, lng = json.result?.longitude
    return typeof lat === 'number' && typeof lng === 'number' ? { postcode, lat, lng } : null
  } catch {
    return null
  }
}
