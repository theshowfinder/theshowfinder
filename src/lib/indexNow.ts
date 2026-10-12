// IndexNow: tells Bing, Yandex and other participating search engines about new
// or changed URLs straight away instead of waiting for them to be re-crawled.
// (Google does not use IndexNow.) The key is public by design: it is also
// served at /<key>.txt so engines can verify we own the site.
// Pure helpers only, so `node --test` can run them.

export const INDEXNOW_KEY = '6bc0381ea4c6a91c4495d11855363974'
export const INDEXNOW_HOST = 'www.theshowfinder.com'
export const INDEXNOW_MAX_URLS = 10000

export function indexNowKeyLocation(): string {
  return `https://${INDEXNOW_HOST}/${INDEXNOW_KEY}.txt`
}

// Keeps only absolute https URLs on our own host, de-duplicated, capped.
export function cleanIndexNowUrls(urls: string[], max = INDEXNOW_MAX_URLS): string[] {
  const out = new Set<string>()
  for (const raw of urls) {
    try {
      const u = new URL(raw)
      if (u.protocol !== 'https:' || u.host !== INDEXNOW_HOST) continue
      out.add(u.toString())
    } catch {
      // ignore malformed
    }
    if (out.size >= max) break
  }
  return [...out]
}

export function buildIndexNowPayload(urls: string[]) {
  return {
    host: INDEXNOW_HOST,
    key: INDEXNOW_KEY,
    keyLocation: indexNowKeyLocation(),
    urlList: cleanIndexNowUrls(urls),
  }
}
