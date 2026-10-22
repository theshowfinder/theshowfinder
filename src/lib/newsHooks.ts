// Catchy headlines for our news stories, written by Claude from the story's facts and then checked so a hook can
// never say something our listings do not support: every number, weekday, month and city it mentions must be in
// the facts, and claims we cannot verify (farewell, reunion, sold out, biggest...) are rejected outright. Anything
// that fails falls back to the factual template from src/lib/newsStories.ts. Same direct fetch to the Messages
// API as src/lib/newsAiSuggestions.ts (no SDK dependency); without ANTHROPIC_API_KEY the template is used.

import { CITIES } from './cities.ts'
import { DEFAULT_AI_MODEL } from './newsAiSuggestions.ts'
import type { StoryFacts } from './newsStories.ts'
import { clockLabel, longDayLabel } from './newsStories.ts'

const AI_TIMEOUT_MS = 15_000
export const HOOK_MAX = 90
export const HOOK_MIN = 20
export const STANDFIRST_MAX = 240

export interface Hook { headline: string; standfirst: string | null }

const TZ = 'Europe/London'
const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

// Claims our listings cannot support, and relative time words that go stale while the story stays up.
const UNVERIFIABLE = /\b(farewell|final|last[- ]ever|last chance|reunion|reunit\w*|comeback|come back|is back|back on the road|returns?|returning|again|album|record|single|sold[- ]out|sell[- ]?outs?|selling fast|fastest|biggest|largest|huge demand|demand|retir\w*|debut|first[- ]ever|exclusive|secret|surprise|anniversary|free|cheap|limited|rare|only|today|tonight|tomorrow|this week|next week|this weekend|yesterday|guaranteed|best seats|legend\w*|iconic|massive|epic|historic|record[- ]breaking|in ages|years)\b/i

function iso(f: StoryFacts): string[] {
  return [f.firstDate, f.lastDate, f.onsaleAt, f.presaleAt, ...f.dates.map(d => d.date)].filter(Boolean) as string[]
}

function part(isoDate: string, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('en-GB', { ...opts, timeZone: TZ }).format(new Date(isoDate)).toLowerCase()
}

/** Every number a hook may contain, as strings. */
export function allowedNumbers(f: StoryFacts): Set<string> {
  const out = new Set<string>([String(f.dateCount), String(f.cityCount)])
  for (const d of iso(f)) {
    out.add(part(d, { year: 'numeric' }))
    out.add(part(d, { day: 'numeric' }))
  }
  for (const d of [f.onsaleAt, f.presaleAt].filter(Boolean) as string[]) {
    const label = clockLabel(d) // "9:30am" / "10am"
    for (const n of label.match(/\d+/g) ?? []) out.add(n)
    out.add(part(d, { hour: '2-digit', hour12: false }).replace(/^0/, ''))
  }
  for (const n of f.artistName.match(/\d+/g) ?? []) out.add(n)
  for (const d of f.dates) for (const n of `${d.venue ?? ''}`.match(/\d+/g) ?? []) out.add(n)
  return out
}

function words(text: string): string[] {
  return text.toLowerCase().match(/[a-z]+/g) ?? []
}

function normaliseName(s: string): string {
  return s.toLowerCase().replace(/^the\s+/, '').replace(/[^a-z0-9]+/g, ' ').trim()
}

/** Why a hook is not allowed, or null when it passes. */
export function hookProblem(text: string, f: StoryFacts, opts: { requireName: boolean }): string | null {
  if (opts.requireName && !normaliseName(text).includes(normaliseName(f.artistName))) return 'artist name missing'
  // Text minus the artist and venue names, so "Texas" or "O2 Academy" never trips the checks below.
  let rest = text
  for (const n of [f.artistName, ...f.dates.map(d => d.venue ?? '')].filter(Boolean).sort((a, b) => b.length - a.length)) {
    rest = rest.split(n).join(' ')
  }
  const bad = UNVERIFIABLE.exec(rest)
  if (bad) return `unverifiable claim: ${bad[0]}`
  const nums = allowedNumbers(f)
  for (const n of rest.match(/\d+/g) ?? []) if (!nums.has(n.replace(/^0+(?=\d)/, ''))) return `number not in facts: ${n}`
  const restWords = words(rest)
  const okDays = new Set(iso(f).map(d => part(d, { weekday: 'long' })))
  const okMonths = new Set(iso(f).map(d => part(d, { month: 'long' })))
  for (const w of restWords) {
    const day = WEEKDAYS.find(d => w === d || (w.length >= 3 && d.startsWith(w) && ['mon', 'tue', 'tues', 'wed', 'thu', 'thur', 'thurs', 'fri', 'sat', 'sun'].includes(w)))
    if (day && !okDays.has(day)) return `weekday not in facts: ${w}`
    const month = MONTHS.find(m => w === m || (w.length === 3 && m.startsWith(w) && w !== 'may' && w !== 'mar'))
    if (month && !okMonths.has(month)) return `month not in facts: ${w}`
  }
  const lower = ` ${rest.toLowerCase().replace(/[^a-z ]+/g, ' ')} `
  const okCities = new Set(f.cities.map(c => c.toLowerCase()))
  for (const c of CITIES) {
    const n = c.name.toLowerCase()
    if (lower.includes(` ${n} `) && !okCities.has(n)) return `city not in facts: ${c.name}`
  }
  if (/\bstadium/i.test(rest) && !f.hasStadiumDate) return 'not a stadium tour'
  if (/\barena/i.test(rest) && !f.scale && !f.hasStadiumDate && !f.dates.some(d => /arena/i.test(d.venue ?? ''))) return 'not an arena tour'
  if (/\bpresale|pre-sale/i.test(rest) && !f.presaleAt) return 'no presale in facts'
  if (/\bannounc/i.test(rest) === false && /\bnew\b/i.test(rest) === false && /\btour|dates?|show|gig/i.test(rest) === false) return 'not about the announcement'
  return null
}

export function validateHook(raw: unknown, f: StoryFacts): { hook: Hook | null; problem: string | null } {
  if (!raw || typeof raw !== 'object') return { hook: null, problem: 'not an object' }
  const r = raw as Record<string, unknown>
  const headline = typeof r.headline === 'string' ? r.headline.replace(/\s+/g, ' ').trim().replace(/^["']|["']$/g, '') : ''
  const standfirst = typeof r.standfirst === 'string' ? r.standfirst.replace(/\s+/g, ' ').trim() : ''
  if (headline.length < HOOK_MIN || headline.length > HOOK_MAX) return { hook: null, problem: 'headline length' }
  if (/[!]{2,}|[A-Z]{6,}/.test(headline.split(f.artistName).join(''))) return { hook: null, problem: 'shouty' }
  const hp = hookProblem(headline, f, { requireName: true })
  if (hp) return { hook: null, problem: `headline: ${hp}` }
  let sf: string | null = null
  if (standfirst && standfirst.length <= STANDFIRST_MAX && !hookProblem(standfirst, f, { requireName: false })) sf = standfirst
  return { hook: { headline, standfirst: sf }, problem: null }
}

export function buildHookPrompt(f: StoryFacts): string {
  const facts = {
    artist: f.artistName,
    kind: f.storyType === 'tour_announcement' ? 'new UK tour announced' : 'new UK dates added',
    category: f.category,
    number_of_dates: f.dateCount,
    number_of_cities: f.cityCount,
    cities: f.cities,
    venues: [...new Set(f.dates.map(d => d.venue).filter(Boolean))].slice(0, 8),
    first_show: longDayLabel(f.firstDate),
    last_show: longDayLabel(f.lastDate),
    includes_stadium_show: f.hasStadiumDate,
    mostly_arenas_or_stadiums: !!f.scale,
    presale_opens: f.presaleAt ? `${longDayLabel(f.presaleAt)} at ${clockLabel(f.presaleAt)}` : null,
    general_sale_opens: f.onsaleAt ? `${longDayLabel(f.onsaleAt)} at ${clockLabel(f.onsaleAt)}` : null,
  }
  return [
    'You write headlines for TheShowFinder, a UK site that helps people get tickets for live shows.',
    'Write ONE news headline and ONE standfirst (a one or two sentence intro) about the announcement below.',
    '',
    'Rules:',
    `- Headline: ${HOOK_MIN}-${HOOK_MAX} characters, must contain the artist name exactly as given, British English, sentence case.`,
    '- Make it a hook people want to click: lead with the news and the most useful detail (when tickets go on sale, presale, how big or how many dates).',
    '- Use ONLY the facts given. Do not invent or imply anything else: no "farewell", "final", "reunion", "comeback", "back", "returns", "sold out", "selling fast", "biggest", "album", "legendary", "iconic", "years".',
    '- Do not use relative times (today, tonight, tomorrow, this week). Use the day and date from the facts.',
    '- Only mention numbers, days, months and cities that appear in the facts. No exclamation marks, no emoji, no all-caps.',
    `- Standfirst: at most ${STANDFIRST_MAX} characters, factual, says what was announced and when tickets go on sale.`,
    '',
    'Facts (JSON):',
    JSON.stringify(facts, null, 2),
    '',
    'Reply with JSON only, no other text: {"headline": "...", "standfirst": "..."}',
  ].join('\n')
}

export function parseHookResponse(text: string | null): unknown {
  if (!text) return null
  const m = /\{[\s\S]*\}/.exec(text)
  if (!m) return null
  try { return JSON.parse(m[0]) } catch { return null }
}

/** Asks Claude for a hook; returns null (use the template) on any failure or failed check. */
export async function requestHook(f: StoryFacts): Promise<{ hook: Hook | null; problem: string | null }> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { hook: null, problem: 'ANTHROPIC_API_KEY not set' }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS)
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || DEFAULT_AI_MODEL,
        max_tokens: 400,
        messages: [{ role: 'user', content: buildHookPrompt(f) }],
      }),
    })
    if (!res.ok) return { hook: null, problem: `HTTP ${res.status}` }
    const data = (await res.json()) as { content?: { type: string; text?: string }[] }
    return validateHook(parseHookResponse(data.content?.find(b => b.type === 'text')?.text ?? null), f)
  } catch (err) {
    return { hook: null, problem: err instanceof Error && err.name === 'AbortError' ? 'timed out' : 'network error' }
  } finally {
    clearTimeout(timeout)
  }
}
