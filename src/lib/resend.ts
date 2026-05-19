import { Resend } from 'resend'

const apiKey = process.env.RESEND_API_KEY
if (!apiKey) {
  console.error('[resend] RESEND_API_KEY is not set — emails will not send')
}

export const resend = new Resend(apiKey ?? '')

export const FROM_EMAIL = 'hello@theshowfinder.com'
