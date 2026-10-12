// Standalone HTML for the embeddable "upcoming shows" widget (artists, venues,
// cities can paste an iframe on their own site). Pure functions, no imports.

export interface EmbedRow {
  title: string
  startDate: string
  where: string | null
  url: string
}

export interface EmbedInput {
  heading: string
  rows: EmbedRow[]
  moreUrl: string
  moreLabel: string
  theme?: 'light' | 'dark'
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function when(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  })
}

export function parseEmbedTheme(value: string | null | undefined): 'light' | 'dark' {
  return value === 'dark' ? 'dark' : 'light'
}

export function renderEmbedHtml({ heading, rows, moreUrl, moreLabel, theme = 'light' }: EmbedInput): string {
  const dark = theme === 'dark'
  const bg = dark ? '#14141f' : '#ffffff'
  const fg = dark ? '#f1f1f5' : '#1a1a2e'
  const muted = dark ? '#a3a3b5' : '#64748b'
  const line = dark ? '#2a2a3d' : '#e2e8f0'
  const items = rows.length
    ? rows.map(r => `<li><a href="${escapeHtml(r.url)}" target="_blank" rel="noopener"><span class="t">${escapeHtml(r.title)}</span><span class="m">${escapeHtml(when(r.startDate))}${r.where ? ` · ${escapeHtml(r.where)}` : ''}</span></a></li>`).join('')
    : '<li class="empty">No upcoming shows listed right now.</li>'
  return `<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${escapeHtml(heading)}</title>
<style>
*{box-sizing:border-box}body{margin:0;font:14px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:${bg};color:${fg}}
h1{font-size:15px;margin:0;padding:12px 14px;border-bottom:1px solid ${line}}
ul{list-style:none;margin:0;padding:0}li{border-bottom:1px solid ${line}}
a{display:block;padding:10px 14px;color:inherit;text-decoration:none}a:hover{background:${dark ? '#1d1d2c' : '#f8fafc'}}
.t{display:block;font-weight:600}.m{display:block;color:${muted};font-size:12px;margin-top:2px}
.empty{padding:14px;color:${muted}}
.f{display:flex;justify-content:space-between;gap:12px;padding:10px 14px;font-size:12px;color:${muted}}
.f a{display:inline;padding:0;color:#E8003D;font-weight:600}
</style></head><body>
<h1>${escapeHtml(heading)}</h1>
<ul>${items}</ul>
<div class="f"><a href="${escapeHtml(moreUrl)}" target="_blank" rel="noopener">${escapeHtml(moreLabel)} →</a><span>Powered by <a href="https://www.theshowfinder.com/" target="_blank" rel="noopener">TheShowFinder</a></span></div>
</body></html>`
}

// "https://www.theshowfinder.com/artists/foo" -> { type: 'artist', slug: 'foo' }.
// Accepts a pasted page URL so people don't have to know slugs.
export function parseEmbedTarget(input: string): { type: 'artist' | 'venue' | 'city'; slug: string } | null {
  let path = input.trim()
  try {
    path = new URL(path).pathname
  } catch {
    // not a full URL: treat as a path
  }
  const m = path.replace(/\/+$/, '').match(/^\/(artists|venues|cities)\/([^/]+)/)
  if (!m) return null
  const type = m[1] === 'artists' ? 'artist' : m[1] === 'venues' ? 'venue' : 'city'
  return { type, slug: decodeURIComponent(m[2]) }
}
