import { Resend } from 'resend'

const apiKey = process.env.RESEND_API_KEY
if (!apiKey) {
  console.error('[resend] RESEND_API_KEY is not set — emails will not send')
}

export const resend = new Resend(apiKey ?? '')

// A display name, not a bare address: mail clients show "TheShowFinder", and a bare address reads as less trusted.
export const FROM_EMAIL = 'TheShowFinder <hello@theshowfinder.com>'

/**
 * One-click unsubscribe headers for newsletters and alerts (RFC 8058). Gmail and Yahoo expect them on bulk mail
 * and show their own "Unsubscribe" button; without them a newsletter is more likely to be filtered.
 * The POST goes to /api/unsubscribe, which unsubscribes the address at once.
 */
export function listUnsubscribeHeaders(email: string, baseUrl = 'https://www.theshowfinder.com'): Record<string, string> {
  const url = `${baseUrl}/api/unsubscribe?email=${encodeURIComponent(email)}`
  return {
    'List-Unsubscribe': `<${url}>, <mailto:hello@theshowfinder.com?subject=unsubscribe>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  }
}
