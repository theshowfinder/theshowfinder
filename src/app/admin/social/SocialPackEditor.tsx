'use client'

// Phase 7, requirement 9 — editable platform drafts, copy buttons, and
// "open platform" buttons for a Social Pack. Mirrors the existing
// ShareKit's local-state-plus-copy-button pattern (src/app/admin/news/
// ShareKit.tsx) but this one also actually persists edits via
// updateAction, since a Social Pack is a real row an admin comes back to
// (unlike ShareKit's per-view-only defaults). Nothing in this component
// ever calls a social-platform API — "open platform" just opens the
// platform's own site/share-dialog in a new tab for the admin to paste
// into by hand.

import { useState } from 'react'
import type { SocialPack } from '@/lib/types/database'

interface SocialPackEditorProps {
  pack: SocialPack
  updateAction: (formData: FormData) => void | Promise<void>
}

const PLATFORM_OPEN_URLS = {
  facebook: (destinationUrl: string) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(destinationUrl)}`,
  instagram: () => 'https://www.instagram.com/',
  tiktok: () => 'https://www.tiktok.com/upload',
}

export default function SocialPackEditor({ pack, updateAction }: SocialPackEditorProps) {
  const [headline, setHeadline] = useState(pack.headline)
  const [context, setContext] = useState(pack.context)
  const [facebookText, setFacebookText] = useState(pack.facebook_text)
  const [instagramText, setInstagramText] = useState(pack.instagram_text)
  const [tiktokText, setTiktokText] = useState(pack.tiktok_text)
  const [hashtagsText, setHashtagsText] = useState(pack.hashtags.join(' '))
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  async function copy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(key)
      setTimeout(() => setCopiedKey(current => (current === key ? null : current)), 1500)
    } catch {
      // Clipboard access can be denied by the browser — the text is still
      // right there in the field to select and copy manually.
    }
  }

  return (
    <form action={updateAction} className="space-y-6">
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Headline &amp; context</h2>

        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Headline</label>
          <input
            name="headline"
            value={headline}
            onChange={e => setHeadline(e.target.value)}
            className="w-full text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Context</label>
          <textarea
            name="context"
            value={context}
            onChange={e => setContext(e.target.value)}
            rows={2}
            className="w-full text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Hashtags</label>
            <button type="button" onClick={() => copy('hashtags', hashtagsText)} className="text-xs font-semibold text-blue-600 hover:underline">
              {copiedKey === 'hashtags' ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <input
            name="hashtags"
            value={hashtagsText}
            onChange={e => setHashtagsText(e.target.value)}
            className="w-full text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>
      </section>

      {([
        { key: 'facebook_text', label: 'Facebook draft', value: facebookText, setValue: setFacebookText, openLabel: 'Open Facebook share dialog', openUrl: PLATFORM_OPEN_URLS.facebook(pack.destination_url) },
        { key: 'instagram_text', label: 'Instagram draft', value: instagramText, setValue: setInstagramText, openLabel: 'Open Instagram', openUrl: PLATFORM_OPEN_URLS.instagram() },
        { key: 'tiktok_text', label: 'TikTok draft', value: tiktokText, setValue: setTiktokText, openLabel: 'Open TikTok upload', openUrl: PLATFORM_OPEN_URLS.tiktok() },
      ] as const).map(platform => (
        <section key={platform.key} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider">{platform.label}</h2>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => copy(platform.key, platform.value)} className="text-xs font-semibold text-blue-600 hover:underline">
                {copiedKey === platform.key ? 'Copied!' : 'Copy'}
              </button>
              <a href={platform.openUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-slate-500 hover:text-slate-700">
                {platform.openLabel} →
              </a>
            </div>
          </div>
          <textarea
            name={platform.key}
            value={platform.value}
            onChange={e => platform.setValue(e.target.value)}
            rows={4}
            className="w-full text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
          {platform.key !== 'facebook_text' && (
            <p className="text-xs text-slate-400">
              No website link is placed in this caption — Instagram and TikTok captions aren&rsquo;t clickable, so this
              uses &ldquo;Link in bio&rdquo; wording instead. Point your bio link tool at the tracked link below.
            </p>
          )}
        </section>
      ))}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          className="font-bold text-white px-6 py-2.5 rounded-xl hover:opacity-90 transition-opacity"
          style={{ backgroundColor: '#E8003D' }}
        >
          Save changes
        </button>
        <p className="text-xs text-slate-400">Saves the text above to this pack. Still nothing posts anywhere.</p>
      </div>
    </form>
  )
}
