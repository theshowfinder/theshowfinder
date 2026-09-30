// Phase 3 of the News Intelligence Inbox: asks Claude to suggest structured
// editorial fields from an extracted article (see src/lib/urlIntake.ts).
// Nothing here ever publishes or writes a news_candidates row directly —
// this module only produces a suggestion object; src/app/admin/actions.ts
// decides what to do with it (always: insert a 'pending' candidate,
// pre-filled with the suggestion as an editable draft).
//
// Uses the Anthropic Messages API directly via fetch — no @anthropic-ai/sdk
// dependency, matching this codebase's existing preference for
// dependency-free HTTP calls (see src/lib/councilEvents.ts). Requires
// ANTHROPIC_API_KEY; if it's not set, requestAiSuggestions degrades
// gracefully to an empty suggestion + a warning, rather than failing the
// whole URL-intake flow — the admin still gets the extracted article
// content to fill in by hand.
//
// Split the same way as src/lib/urlIntake.ts: pure, fully unit-testable
// logic (buildSuggestionPrompt, parseAiSuggestion) separated from the thin
// I/O wrapper (requestAiSuggestions) that actually calls the network.

import { CITIES } from './cities.ts'
import type { ExtractedArticle } from './urlIntake.ts'
import type { NewsStoryType, NewsPriority } from './types/database.ts'

export const DEFAULT_AI_MODEL = 'claude-haiku-4-5-20251001'
const AI_TIMEOUT_MS = 20_000
const MAX_OUTPUT_TOKENS = 1024

export interface AiSuggestion {
  headline: string | null
  summary: string | null
  scope_type: 'national' | 'city'
  cities: string[]
  category: NewsStoryType
  priority: NewsPriority
  suggested_published_at: string | null
  confidence: 'high' | 'medium' | 'low'
  uncertainty_notes: string | null
  social_caption: string | null
  email_teaser: string | null
}

const VALID_CATEGORIES: NewsStoryType[] = ['presale', 'tour_announcement', 'new_dates', 'venue_news', 'general_entertainment']
const VALID_PRIORITIES: NewsPriority[] = ['low', 'normal', 'high']
const CITY_NAMES = CITIES.map(c => c.name)

function emptySuggestion(): AiSuggestion {
  return {
    headline: null,
    summary: null,
    scope_type: 'national',
    cities: [],
    category: 'general_entertainment',
    priority: 'normal',
    suggested_published_at: null,
    confidence: 'low',
    uncertainty_notes: null,
    social_caption: null,
    email_teaser: null,
  }
}

// Pure — builds the prompt text from already-extracted article data. Never
// includes anything beyond what was actually extracted from the page, and
// explicitly instructs the model not to invent facts.
export function buildSuggestionPrompt(extracted: ExtractedArticle): string {
  const supportedCities = CITY_NAMES.join(', ')
  return `You are helping an editor at a UK live-events discovery website (TheShowFinder) turn a news article into a structured, reviewable news item. You are given ONLY the text extracted from the article below. Do not use any outside knowledge about the event, artist, venue, or ticket details beyond what is written here.

CRITICAL RULES:
- Do not invent facts, dates, venues, ticket details, or cities that are not clearly stated in the article text below.
- Only include a city in "cities" if it is one of TheShowFinder's supported cities AND the article clearly ties the story to that city. Supported cities: ${supportedCities}.
- If scope is unclear, default to "national" and leave "cities" empty.
- If anything is unclear, ambiguous, or missing, say so plainly in "uncertainty_notes" rather than guessing.
- Respond with ONLY a single JSON object, no markdown code fences, no commentary before or after it, matching exactly this shape:

{
  "headline": string,
  "summary": string,
  "scope_type": "national" | "city",
  "cities": string[],
  "category": "presale" | "tour_announcement" | "new_dates" | "venue_news" | "general_entertainment",
  "priority": "low" | "normal" | "high",
  "suggested_published_at": string | null,
  "confidence": "high" | "medium" | "low",
  "uncertainty_notes": string | null,
  "social_caption": string,
  "email_teaser": string
}

ARTICLE
Source domain: ${extracted.sourceDomain}
Page title: ${extracted.title ?? '(none extracted)'}
Headline: ${extracted.headline ?? '(none extracted)'}
Description: ${extracted.description ?? '(none extracted)'}
Published: ${extracted.publishedAt ?? '(unknown)'}
Original URL: ${extracted.originalUrl}

Article text:
${extracted.articleText ?? '(no article text could be extracted from this page — base your response only on the title/description/headline above, and say so in uncertainty_notes)'}`
}

// Pure validation/sanitization of whatever the model returned. Never
// throws — a malformed or partially-wrong response degrades to safe
// defaults plus a human-readable warning per problem found, rather than
// failing the whole intake. This is what requirement 8's "malformed AI
// response" test covers.
export function parseAiSuggestion(raw: unknown): { suggestion: AiSuggestion; warnings: string[] } {
  const warnings: string[] = []
  const suggestion = emptySuggestion()

  let obj: Record<string, unknown>
  if (typeof raw === 'string') {
    try {
      // Models sometimes wrap JSON in a code fence despite instructions —
      // strip one if present before parsing.
      const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '')
      obj = JSON.parse(cleaned)
    } catch {
      warnings.push('AI response was not valid JSON — suggestions unavailable, fields left blank for manual entry.')
      return { suggestion, warnings }
    }
  } else if (raw && typeof raw === 'object') {
    obj = raw as Record<string, unknown>
  } else {
    warnings.push('AI response was empty or malformed — suggestions unavailable, fields left blank for manual entry.')
    return { suggestion, warnings }
  }

  if (typeof obj.headline === 'string' && obj.headline.trim()) {
    suggestion.headline = obj.headline.trim()
  } else {
    warnings.push('AI did not suggest a headline.')
  }

  if (typeof obj.summary === 'string' && obj.summary.trim()) {
    suggestion.summary = obj.summary.trim()
  }

  if (obj.scope_type === 'national' || obj.scope_type === 'city') {
    suggestion.scope_type = obj.scope_type
  } else if (obj.scope_type !== undefined) {
    warnings.push(`AI suggested an invalid scope ("${String(obj.scope_type)}") — defaulted to national.`)
  }

  if (Array.isArray(obj.cities)) {
    const raw_cities = obj.cities.filter((c): c is string => typeof c === 'string')
    const valid = raw_cities.filter(c => CITY_NAMES.includes(c))
    const invalid = raw_cities.filter(c => !CITY_NAMES.includes(c))
    suggestion.cities = [...new Set(valid)]
    if (invalid.length) {
      warnings.push(`AI suggested unsupported cities, ignored: ${invalid.join(', ')}.`)
    }
  }

  if (suggestion.scope_type === 'city' && suggestion.cities.length === 0) {
    warnings.push('AI suggested a city scope but no valid supported city — defaulted to national; pick a city manually if one applies.')
    suggestion.scope_type = 'national'
  }

  if (typeof obj.category === 'string' && (VALID_CATEGORIES as string[]).includes(obj.category)) {
    suggestion.category = obj.category as NewsStoryType
  } else if (obj.category !== undefined) {
    warnings.push(`AI suggested an invalid category ("${String(obj.category)}") — defaulted to general entertainment.`)
  }

  if (typeof obj.priority === 'string' && (VALID_PRIORITIES as string[]).includes(obj.priority)) {
    suggestion.priority = obj.priority as NewsPriority
  } else if (obj.priority !== undefined) {
    warnings.push(`AI suggested an invalid priority ("${String(obj.priority)}") — defaulted to normal.`)
  }

  if (typeof obj.suggested_published_at === 'string' && obj.suggested_published_at) {
    const d = new Date(obj.suggested_published_at)
    if (!Number.isNaN(d.getTime())) {
      suggestion.suggested_published_at = d.toISOString()
    } else {
      warnings.push('AI suggested an unparseable publication date — ignored.')
    }
  }

  if (obj.confidence === 'high' || obj.confidence === 'medium' || obj.confidence === 'low') {
    suggestion.confidence = obj.confidence
  }

  if (typeof obj.uncertainty_notes === 'string' && obj.uncertainty_notes.trim()) {
    suggestion.uncertainty_notes = obj.uncertainty_notes.trim()
  }

  if (typeof obj.social_caption === 'string' && obj.social_caption.trim()) {
    suggestion.social_caption = obj.social_caption.trim()
  }

  if (typeof obj.email_teaser === 'string' && obj.email_teaser.trim()) {
    suggestion.email_teaser = obj.email_teaser.trim()
  }

  return { suggestion, warnings }
}

export interface AiSuggestionResult {
  suggestion: AiSuggestion
  warnings: string[]
  model: string | null // null when no AI call was made at all (no API key)
}

// Thin I/O wrapper — calls the Anthropic Messages API, with a timeout, and
// never throws: any failure (missing key, network error, timeout, non-2xx
// response) degrades to an empty suggestion plus an explanatory warning,
// exactly like a malformed response does. This is deliberate: a flaky or
// unconfigured AI call should never block URL intake itself — the admin
// still gets the extracted article content to fill in by hand.
export async function requestAiSuggestions(extracted: ExtractedArticle): Promise<AiSuggestionResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  const model = process.env.ANTHROPIC_MODEL || DEFAULT_AI_MODEL

  if (!apiKey) {
    const { suggestion } = parseAiSuggestion(null)
    return {
      suggestion,
      warnings: ['AI suggestions are not configured (ANTHROPIC_API_KEY is not set) — fields left blank for manual entry.'],
      model: null,
    }
  }

  const prompt = buildSuggestionPrompt(extracted)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS)

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: MAX_OUTPUT_TOKENS,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!res.ok) {
      const { suggestion } = parseAiSuggestion(null)
      return { suggestion, warnings: [`AI suggestion request failed (HTTP ${res.status}) — fields left blank for manual entry.`], model }
    }

    const data = (await res.json()) as { content?: { type: string; text?: string }[] }
    const text = data.content?.find(b => b.type === 'text')?.text ?? null

    if (!text) {
      const { suggestion } = parseAiSuggestion(null)
      return { suggestion, warnings: ['AI returned no suggestion text — fields left blank for manual entry.'], model }
    }

    const { suggestion, warnings } = parseAiSuggestion(text)
    return { suggestion, warnings, model }
  } catch (err) {
    const { suggestion } = parseAiSuggestion(null)
    const reason = err instanceof Error && err.name === 'AbortError' ? 'timed out' : 'a network error'
    return { suggestion, warnings: [`AI suggestion request failed (${reason}) — fields left blank for manual entry.`], model }
  } finally {
    clearTimeout(timeout)
  }
}
