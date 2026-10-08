'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { SocialPack } from '@/lib/types/database'

interface Props { packs: SocialPack[] }

function imageUrl(pack: SocialPack, format: 'square' | 'vertical') {
  return `/admin/social/${pack.id}/image?format=${format}&v=${encodeURIComponent(pack.updated_at)}`
}

export default function SocialBatchExport({ packs }: Props) {
  const [copied, setCopied] = useState<string | null>(null)
  async function copy(key: string, text: string) {
    await navigator.clipboard.writeText(text)
    setCopied(key)
    window.setTimeout(() => setCopied(current => current === key ? null : current), 1500)
  }
  const facebookBundle = packs.map(pack => `${pack.city_name ?? 'National'}\n${pack.facebook_text}`).join('\n\n---\n\n')

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => copy('all-facebook', facebookBundle)} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700">{copied === 'all-facebook' ? 'Copied all captions' : 'Copy all Facebook captions'}</button>
        <a href="https://business.facebook.com/latest/composer/" target="_blank" rel="noopener noreferrer" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100">Open Meta Business Suite →</a>
        <span className="text-xs text-slate-500">{packs.length} approved pack{packs.length === 1 ? '' : 's'}</span>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        {packs.map(pack => (
          <article key={pack.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-blue-600">{pack.city_name ?? 'National'}</p><h2 className="mt-1 font-extrabold text-slate-900">{pack.headline}</h2></div><Link href={`/admin/social/${pack.id}`} className="shrink-0 text-xs font-semibold text-blue-600 hover:underline">Open pack</Link></div>
            <div className="flex gap-4">
              <div className="min-w-0 flex-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageUrl(pack, 'square')} alt={`${pack.city_name ?? 'National'} square graphic`} className="aspect-square w-full rounded-xl border border-slate-200 object-cover" />
                <a href={imageUrl(pack, 'square')} download={`social-${pack.id}-square.png`} className="mt-2 block text-center text-xs font-bold text-blue-600 hover:underline">Download square</a>
              </div>
              <div className="w-28 shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageUrl(pack, 'vertical')} alt={`${pack.city_name ?? 'National'} vertical graphic`} className="aspect-[9/16] w-full rounded-xl border border-slate-200 object-cover" />
                <a href={imageUrl(pack, 'vertical')} download={`social-${pack.id}-vertical.png`} className="mt-2 block text-center text-xs font-bold text-blue-600 hover:underline">Download vertical</a>
              </div>
            </div>
            <div className="space-y-2"><div className="flex items-center justify-between gap-3"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Facebook + Instagram caption</p><button type="button" onClick={() => copy(pack.id, pack.facebook_text)} className="text-xs font-bold text-blue-600 hover:underline">{copied === pack.id ? 'Copied!' : 'Copy'}</button></div><textarea readOnly value={pack.facebook_text} rows={6} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-700" /></div>
            <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600 break-all"><span className="font-bold text-slate-500">Tracked link: </span>{pack.facebook_link}</div>
          </article>
        ))}
      </div>
    </div>
  )
}
