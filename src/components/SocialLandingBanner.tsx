'use client'

import { Suspense, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import NewsletterInline from '@/components/NewsletterInline'
import { SOCIAL_LINKS } from '@/lib/socialLinks'
import { socialSource, socialSignupSource, SOCIAL_PLATFORM_NAMES } from '@/lib/socialSource'
import { trackEvent } from '@/lib/gtag'

// Shown at the top of /on-sale-this-week only to visitors who arrived from
// one of our social links (utm_source=tiktok|instagram|youtube|...). It is
// purely additive: the page renders fully for everyone, including crawlers,
// and this renders nothing without a social utm_source.
function Banner() {
  const params = useSearchParams()
  const platform = socialSource(params)

  useEffect(() => {
    if (platform) trackEvent('social_landing', { platform })
  }, [platform])

  if (!platform) return null
  const name = SOCIAL_PLATFORM_NAMES[platform]

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
      <div className="max-w-2xl">
        <p className="text-sm font-bold text-slate-700 mb-3">
          👋 Welcome from {name}! Here&apos;s everything going on sale this week, with every ticket seller compared.
        </p>
        <NewsletterInline
          source={socialSignupSource(platform)}
          subject="On sale this week"
          heading="Email me when these go on sale"
          blurb="Free alerts for the week's biggest on-sales and presales, so you're ready when tickets drop. No spam, unsubscribe any time."
          buttonLabel="Email me"
        />
        <p className="mt-3 text-sm text-slate-600">
          Want every on-sale as it happens? Follow us:{' '}
          {SOCIAL_LINKS.map((l, i) => (
            <span key={l.platform}>
              {i > 0 && ' · '}
              <a
                href={l.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={l.label}
                onClick={() => trackEvent('social_follow_click', { platform: l.platform.toLowerCase(), from: 'on_sale_banner' })}
                className="font-bold underline hover:text-slate-900"
              >
                {l.platform}
              </a>
            </span>
          ))}
        </p>
      </div>
    </div>
  )
}

export default function SocialLandingBanner() {
  return (
    <Suspense fallback={null}>
      <Banner />
    </Suspense>
  )
}
