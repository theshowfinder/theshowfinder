'use client'

import { useMemo, useState } from 'react'
import { parseEmbedTarget } from '@/lib/embedWidget'

const SITE = 'https://www.theshowfinder.com'
const PAGE_PATH = { artist: 'artists', venue: 'venues', city: 'cities' } as const

export default function WidgetGenerator() {
  const [url, setUrl] = useState('')
  const [dark, setDark] = useState(false)
  const [copied, setCopied] = useState(false)

  const target = useMemo(() => (url.trim() ? parseEmbedTarget(url) : null), [url])

  const snippet = useMemo(() => {
    if (!target) return ''
    const slug = encodeURIComponent(target.slug)
    const src = `${SITE}/embed/${target.type}/${slug}${dark ? '?theme=dark' : ''}`
    const page = `${SITE}/${PAGE_PATH[target.type]}/${slug}`
    return [
      `<iframe src="${src}" width="100%" height="460" style="max-width:420px;border:1px solid #e2e8f0;border-radius:12px" loading="lazy" title="Upcoming shows on TheShowFinder"></iframe>`,
      `<p><a href="${page}">Find tickets on TheShowFinder</a></p>`,
    ].join('\n')
  }, [target, dark])

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard blocked: the text is selectable below
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
      <label className="block">
        <span className="block text-sm font-semibold text-slate-700 mb-1">Your TheShowFinder page address</span>
        <input
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://www.theshowfinder.com/artists/your-name"
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
        />
      </label>
      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" checked={dark} onChange={e => setDark(e.target.checked)} />
        Dark theme
      </label>

      {url.trim() && !target && (
        <p className="text-sm text-red-600">That doesn&rsquo;t look like an artist, venue or city page address.</p>
      )}

      {target && (
        <>
          <textarea readOnly value={snippet} rows={5} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono" onFocus={e => e.currentTarget.select()} />
          <div className="flex items-center gap-4">
            <button type="button" onClick={copy} className="font-bold text-white px-5 py-2 rounded-lg" style={{ backgroundColor: '#E8003D' }}>
              {copied ? 'Copied' : 'Copy snippet'}
            </button>
            <span className="text-sm text-slate-500">Paste it into your site&rsquo;s HTML or an embed block.</span>
          </div>
          <iframe
            src={`/embed/${target.type}/${encodeURIComponent(target.slug)}${dark ? '?theme=dark' : ''}`}
            title="Widget preview"
            width="100%"
            height="460"
            style={{ border: '1px solid #e2e8f0', borderRadius: 12, maxWidth: 420 }}
          />
        </>
      )}
    </div>
  )
}
