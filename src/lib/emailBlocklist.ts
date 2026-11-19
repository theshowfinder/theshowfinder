// Pull the email addresses out of whatever was pasted (an address, a forwarded "From:" line, several lines).
const EMAIL = /[a-z0-9._%+'-]+@[a-z0-9.-]+\.[a-z]{2,}/gi

export function parseBlockEmails(text: string): string[] {
  const found = (text.match(EMAIL) ?? []).map(e => e.toLowerCase().replace(/\.+$/, ''))
  return [...new Set(found)].slice(0, 50)
}
