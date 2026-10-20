// Ticketmaster event slugs are `<title-words>-<last 8 characters of the Ticketmaster id>`. If Ticketmaster renames a
// show its title words change, so an older link (sitemap, Google, a shared URL) no longer matches any slug. The
// 8-character tail never changes, so it can find the show again and send the visitor to its current address.

/** The Ticketmaster-id tail of a slug, or null when the slug does not look like one. */
export function slugIdTail(slug: string): string | null {
  if (slug.length < 10 || slug[slug.length - 9] !== '-') return null
  return slug.slice(-8)
}

/** LIKE pattern matching ids that end with the tail (underscore and percent are LIKE wildcards, so escape them). */
export function idTailPattern(tail: string): string {
  return `%${tail.replace(/[\\%_]/g, m => `\\${m}`)}`
}
