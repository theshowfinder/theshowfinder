// Email-safe copies of the city hero artwork (Outlook and some Gmail clients do not show WebP).
// node scripts/build-email-city-images.mjs → public/email/city/<slug>.jpg, used by the advertiser outreach email.
import sharp from 'sharp'
import { readdirSync } from 'node:fs'
import { join, basename } from 'node:path'

const src = 'public/city-heroes', out = 'public/email/city'
for (const f of readdirSync(src).filter(f => f.endsWith('.webp'))) {
  const slug = basename(f, '.webp')
  await sharp(join(src, f)).resize(1200, 400, { fit: 'cover' }).jpeg({ quality: 72, progressive: true, mozjpeg: true }).toFile(join(out, `${slug}.jpg`))
}
console.log('done')
