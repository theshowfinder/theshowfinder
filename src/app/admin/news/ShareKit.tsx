'use client'

// Phase 4, requirement 5: "prepare content for email and social reuse."
// A self-contained client component — everything here is local React
// state only. Nothing is persisted to the database (no new migration,
// per Chris's instructions) and nothing posts anywhere: nothing in this
// panel sends to Facebook, Instagram, TikTok, or email. It exists purely
// so an admin can copy already-approved/published-story copy out to
// wherever they're posting it by hand, editing any field first if they
// want to tweak it from the AI-seeded or candidate-derived default.

import { useState } from 'react'
import type { ShareKitDefaults, ShareKitPlatformLinks, SharePlatform } from '@/lib/newsPublishing'

interface ShareKitProps {
  defaults: ShareKitDefaults
  platformLinks: ShareKitPlatformLinks
}

const PLATFORM_LABELS: Record<SharePlatform, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  email: 'Email',
}

interface FieldConfig {
  key: keyof Omit<ShareKitDefaults, 'cities' | 'hashtags'>
  label: string
  multiline: boolean
}

const FIELDS: FieldConfig[] = [
  { key: 'headline', label: 'Headline', multiline: false },
  { key: 'summary', label: 'Short summary', multiline: true },
  { key: 'socialCaption', label: 'Social caption', multiline: true },
  { key: 'emailTeaser', label: 'Email teaser', multiline: true },
  { key: 'sourceLink', label: 'Source link', multiline: false },
]

export default function ShareKit({ defaults, platformLinks }: ShareKitProps) {
  const [values, setValues] = useState({
    headline: defaults.headline,
    summary: defaults.summary,
    socialCaption: defaults.socialCaption,
    emailTeaser: defaults.emailTeaser,
    sourceLink: defaults.sourceLink,
  })
  const [hashtagsText, setHashtagsText] = useState(defaults.hashtags.join(' '))
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  async function copy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(key)
      setTimeout(() => setCopiedKey(current => (current === key ? null : current)), 1500)
    } catch {
      // Clipboard access can be denied by the browser (e.g. no HTTPS
      // context, or a permissions policy) — fail silently rather than
      // showing an error for what's a convenience feature; the text is
      // still right there in the field to select and copy manually.
    }
  }

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
      <div>
        <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Share &amp; email kit</h2>
        <p className="text-xs text-slate-400 mt-1">
          Reusable copy for email and social — edit anything below before copying. Nothing here posts automatically;
          copy it out and post or send it by hand.
        </p>
      </div>

      {FIELDS.map(field => {
        const value = values[field.key]
        const InputTag = field.multiline ? 'textarea' : 'input'
        return (
          <div key={field.key}>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{field.label}</label>
              <button
                type="button"
                onClick={() => copy(field.key, value)}
                disabled={!value}
                className="text-xs font-semibold text-blue-600 hover:underline disabled:text-slate-300 disabled:no-underline"
              >
                {copiedKey === field.key ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <InputTag
              value={value}
              onChange={e => setValues(current => ({ ...current, [field.key]: e.target.value }))}
              rows={field.multiline ? 3 : undefined}
              className="w-full text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
              placeholder={value ? undefined : '(none — add your own)'}
            />
          </div>
        )
      })}

      <div>
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">
          Platform links
        </label>
        <p className="text-xs text-slate-400 mb-2">
          Same source link, tagged per platform so clicks back on the site show up separately in analytics. Paste
          the matching one wherever you&apos;re posting — still nothing here posts automatically.
        </p>
        <div className="space-y-2">
          {(Object.keys(PLATFORM_LABELS) as SharePlatform[]).map(platform => {
            const key = `platform-${platform}`
            const link = platformLinks[platform]
            return (
              <div key={platform} className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500 w-16 shrink-0">{PLATFORM_LABELS[platform]}</span>
                <input
                  readOnly
                  value={link}
                  className="flex-1 min-w-0 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 truncate"
                />
                <button
                  type="button"
                  onClick={() => copy(key, link)}
                  className="text-xs font-semibold text-blue-600 hover:underline shrink-0"
                >
                  {copiedKey === key ? 'Copied!' : 'Copy'}
                </button>
              </div>
            )
          })}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Relevant cities</label>
          <button
            type="button"
            onClick={() => copy('cities', defaults.cities.join(', '))}
            disabled={defaults.cities.length === 0}
            className="text-xs font-semibold text-blue-600 hover:underline disabled:text-slate-300 disabled:no-underline"
          >
            {copiedKey === 'cities' ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <p className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
          {defaults.cities.length > 0 ? defaults.cities.join(', ') : '(national — no specific cities selected)'}
        </p>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Hashtags</label>
          <button
            type="button"
            onClick={() => copy('hashtags', hashtagsText)}
            disabled={!hashtagsText}
            className="text-xs font-semibold text-blue-600 hover:underline disabled:text-slate-300 disabled:no-underline"
          >
            {copiedKey === 'hashtags' ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <input
          value={hashtagsText}
          onChange={e => setHashtagsText(e.target.value)}
          className="w-full text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
      </div>

      <p className="text-xs text-slate-400 border-t border-slate-100 pt-3">
        Edits here are local to this page view and are not saved — reopening this candidate resets these fields to
        their defaults.
      </p>
    </section>
  )
}
