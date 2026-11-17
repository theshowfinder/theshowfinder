// Reading a business's own website for a contact email and confirming its company with Companies House.
// Shared by the advertiser finder (cron outreach-find) and the organiser finder (cron organiser-find).
import { extractEmails, pickEmail, extractCompanyNumbers, extractCompanyNames, normCompanyName, isEmailableCompany, usefulLinks } from '@/lib/outreachFind'

type Loose = any // eslint-disable-line @typescript-eslint/no-explicit-any

export async function fetchHtml(url: string, ua: string, ms = 8000): Promise<string | null> {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': ua, Accept: 'text/html' }, redirect: 'follow', signal: AbortSignal.timeout(ms) })
    if (!r.ok || !(r.headers.get('content-type') ?? '').includes('html')) return null
    return (await r.text()).slice(0, 600_000)
  } catch { return null }
}

export const htmlText = (html: string) => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&#039;|&#39;|&rsquo;/g, "'").replace(/\s+/g, ' ')

export async function companiesHouse(path: string): Promise<Loose | null> {
  const key = process.env.COMPANIES_HOUSE_API_KEY
  if (!key) return null
  try {
    const r = await fetch(`https://api.company-information.service.gov.uk${path}`, {
      headers: { Authorization: `Basic ${Buffer.from(`${key}:`).toString('base64')}` }, signal: AbortSignal.timeout(8000),
    })
    return r.ok ? await r.json() : null
  } catch { return null }
}

/** Confirms the business's company with Companies House: by the number on its site, else by its exact registered name. */
export async function verifyCompany(numbers: string[], names: string[], siteText?: string): Promise<{ number: string; name: string } | null> {
  // A number only counts when the company it belongs to is also named on the site, so a stray number (a booking
  // system's, a web designer's) is never taken for the business's own company.
  const onSite = siteText ? normCompanyName(siteText) : null
  for (const n of numbers.slice(0, 3)) {
    const c = await companiesHouse(`/company/${encodeURIComponent(n)}`)
    if (isEmailableCompany(c) && (!onSite || onSite.includes(normCompanyName(c.company_name)))) return { number: c.company_number, name: c.company_name }
  }
  for (const name of names.slice(0, 3)) {
    const s = await companiesHouse(`/search/companies?q=${encodeURIComponent(name)}&items_per_page=5`)
    const hit = (s?.items ?? []).find((i: Loose) => normCompanyName(i.title) === normCompanyName(name) && i.company_status === 'active')
    if (hit) {
      const c = await companiesHouse(`/company/${encodeURIComponent(hit.company_number)}`)
      if (isEmailableCompany(c)) return { number: c.company_number, name: c.company_name }
    }
  }
  return null
}

export interface SiteContact {
  reached: boolean
  email: string | null
  company: { number: string; name: string } | null
  companyNumbers: string[]
  companyNames: string[]
  phone: string | null
}

/** Home page plus contact / privacy / terms pages: the general inbox and the company behind the site. */
export async function readSiteContact(website: string, city: string, ua: string): Promise<SiteContact> {
  const pages: string[] = []
  const home = await fetchHtml(website, ua)
  if (home) {
    pages.push(home)
    for (const link of usefulLinks(home, website)) { const p = await fetchHtml(link, ua, 6000); if (p) pages.push(p) }
  }
  const html = pages.join('\n')
  const text = htmlText(html)
  const email = pickEmail(extractEmails(html), website, city)
  const companyNumbers = extractCompanyNumbers(text), companyNames = extractCompanyNames(text)
  const company = email && process.env.COMPANIES_HOUSE_API_KEY ? await verifyCompany(companyNumbers, companyNames, text) : null
  const phone = html.match(/href="tel:([+\d\s()-]{9,20})"/i)?.[1]?.replace(/\s+/g, ' ').trim() ?? null
  return { reached: !!home, email, company, companyNumbers, companyNames, phone }
}
