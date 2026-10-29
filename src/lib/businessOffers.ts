// Advertiser offers and QR vouchers: the pure rules (codes, how long a voucher lasts, walking distance, PIN checks).
// Relative imports only, so it runs under `node --test`. Database work is in businessVouchers.ts.
import { londonDayWindow } from './intelligence.ts'

/** Voucher codes: 8 characters, no 0/O/1/I/L so staff can read them out. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export function makeVoucherCode(random: (n: number) => Uint8Array): string {
  const bytes = random(8)
  return Array.from(bytes, b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('')
}
export const isVoucherCode = (value: string) => /^[A-HJ-KMNP-Z2-9]{8}$/.test(value)

/** A 4-digit staff PIN (never starts with 0, so it can't lose a digit in a spreadsheet). */
export function makePin(random: (n: number) => Uint8Array): string {
  const b = random(2)
  return String(1000 + (((b[0] << 8) | b[1]) % 9000))
}

/** How many wrong PINs lock a voucher. */
export const MAX_PIN_FAILURES = 5
/** A city-page voucher lasts this many days. */
export const CITY_VOUCHER_DAYS = 7

export interface VoucherWindow { validFrom: string; expiresAt: string }

/**
 * From a show page: valid all day on the show's UK date (claiming early is fine, it just starts that morning).
 * From a city page: valid from now for 7 days.
 */
export function voucherWindow(now: Date, showStartIso: string | null): VoucherWindow {
  if (showStartIso) {
    const day = londonDayWindow(new Date(showStartIso))
    return { validFrom: day.startISO, expiresAt: day.endISO }
  }
  return { validFrom: now.toISOString(), expiresAt: new Date(now.getTime() + CITY_VOUCHER_DAYS * 86_400_000).toISOString() }
}

export type VoucherState = 'valid' | 'not-yet' | 'expired' | 'used' | 'locked'
export function voucherState(v: { valid_from: string; expires_at: string; redeemed_at: string | null; pin_failures: number }, now: Date): VoucherState {
  if (v.redeemed_at) return 'used'
  if (v.pin_failures >= MAX_PIN_FAILURES) return 'locked'
  if (now.getTime() < new Date(v.valid_from).getTime()) return 'not-yet'
  if (now.getTime() >= new Date(v.expires_at).getTime()) return 'expired'
  return 'valid'
}

/** Straight-line distance in metres. */
export function metresBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000, rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/**
 * "4 min walk from the venue" / "1.8 miles from the venue". Streets are not straight lines, so the walk is the
 * straight distance x1.3 at 80 m a minute. Nothing beyond 15 miles (a bad postcode would only mislead).
 */
export function distanceLabel(metres: number | null): string | null {
  if (metres === null || !Number.isFinite(metres)) return null
  if (metres > 24_000) return null
  const walkMin = Math.max(1, Math.round((metres * 1.3) / 80))
  if (walkMin <= 20) return `${walkMin} min walk`
  const miles = metres / 1609.34
  return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} miles`
}

/** UK postcode, tidied ("de1 2ab" -> "DE1 2AB"); null if it doesn't look like one. */
export function tidyPostcode(value: string | null | undefined): string | null {
  const v = (value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (!/^[A-Z]{1,2}[0-9][A-Z0-9]?[0-9][A-Z]{2}$/.test(v)) return null
  return `${v.slice(0, -3)} ${v.slice(-3)}`
}

/** An offer as the advertiser wrote it, trimmed to one short line. */
export function tidyOffer(value: string | null | undefined): string | null {
  const v = (value ?? '').replace(/\s+/g, ' ').trim()
  return v ? v.slice(0, 90) : null
}
