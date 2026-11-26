// /advertise/stay?a=<application id>&k=<signature>: the "stay on" button in a business's end-of-free-month email.
// Opens a fresh Stripe checkout for the monthly price (no free days left, cancel any time). A fresh session is made on
// every click, so the link in the email keeps working. Already paying: straight to the thank-you page.
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyStayOn, stayOnSecret } from '@/lib/advertiserStayOn'
import { gbp, FOUNDING_PRICES } from '@/lib/advertisingPackages'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const origin = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.theshowfinder.com'
  const id = verifyStayOn({ a: url.searchParams.get('a'), k: url.searchParams.get('k') }, stayOnSecret())
  if (!id) return NextResponse.redirect(`${origin}/advertise/staying?error=link`, 303)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any
  const { data: app } = await db.from('advertiser_applications').select('id, email, business_name, city, package, payment_status').eq('id', id).maybeSingle()
  if (!app) return NextResponse.redirect(`${origin}/advertise/staying?error=link`, 303)
  if (app.payment_status === 'paid') return NextResponse.redirect(`${origin}/advertise/staying?done=1`, 303)

  const secret = process.env.STRIPE_SECRET_KEY
  if (!secret) return NextResponse.redirect(`${origin}/advertise/staying?error=stripe`, 303)
  const pkg = app.package === 'featured' ? 'featured' : 'standard'
  const price = FOUNDING_PRICES[pkg]
  const p = new URLSearchParams()
  p.set('mode', 'subscription')
  p.set('line_items[0][price_data][currency]', 'gbp')
  p.set('line_items[0][price_data][unit_amount]', String(Math.round(price * 100)))
  p.set('line_items[0][price_data][recurring][interval]', 'month')
  p.set('line_items[0][price_data][product_data][name]', `TheShowFinder ${pkg === 'featured' ? 'Featured placement' : 'Standard listing'}: ${app.business_name}`)
  p.set('line_items[0][quantity]', '1')
  p.set('customer_email', app.email)
  p.set('client_reference_id', app.id)
  p.set('success_url', `${origin}/advertise/staying?done=1`)
  p.set('cancel_url', `${origin}/advertise/staying?cancelled=1`)
  for (const prefix of ['metadata', 'subscription_data[metadata]']) {
    p.set(`${prefix}[kind]`, 'advertiser_stay_on')
    p.set(`${prefix}[application_id]`, app.id)
    p.set(`${prefix}[package]`, pkg)
    p.set(`${prefix}[term]`, 'monthly, cancel any time')
  }
  p.set('custom_text[submit][message]', `${gbp(price)} a month for ${app.business_name} on TheShowFinder ${app.city}. Monthly, no contract: cancel any time by emailing hello@theshowfinder.com.`)
  const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: p.toString(),
  })
  const s = await r.json() as { url?: string; error?: { message?: string } }
  if (!r.ok || !s.url) {
    console.error('[advertise-stay] checkout failed', s.error?.message)
    return NextResponse.redirect(`${origin}/advertise/staying?error=stripe`, 303)
  }
  return NextResponse.redirect(s.url, 303)
}
