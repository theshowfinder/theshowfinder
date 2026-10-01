import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import Script from 'next/script'
import './globals.css'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { jsonLdScript, buildWebsiteSchema, buildOrganizationSchema } from '@/lib/jsonld'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

const BASE_URL = 'https://www.theshowfinder.com'
const OG_IMAGE  = `${BASE_URL}/og-image.png`

export const metadata: Metadata = {
  title: {
    default:  'TheShowFinder | Find Concerts & Live Events in the UK',
    template: '%s | TheShowFinder',
  },
  description:
    'Discover and compare tickets for concerts, theatre, comedy and live events across the UK. Compare prices from Ticketmaster, See Tickets, Viagogo, StubHub and more.',
  keywords: ['UK events', 'concerts', 'theatre', 'comedy', 'sports', 'tickets', 'live events'],
  metadataBase: new URL(BASE_URL),
  alternates: { canonical: BASE_URL },
  openGraph: {
    title:       'TheShowFinder | Find Concerts & Live Events in the UK',
    description: 'Discover and compare tickets for concerts, theatre, comedy and live events across the UK. Compare prices from Ticketmaster, See Tickets, Viagogo, StubHub and more.',
    type:        'website',
    locale:      'en_GB',
    url:         BASE_URL,
    siteName:    'TheShowFinder',
    images: [{
      url:    OG_IMAGE,
      width:  1200,
      height: 630,
      alt:    'TheShowFinder — Find Your Next Unforgettable Show',
    }],
  },
  twitter: {
    card:        'summary_large_image',
    title:       'TheShowFinder | Find Concerts & Live Events in the UK',
    description: 'Discover and compare tickets for concerts, theatre, comedy and live events across the UK.',
    images:      [OG_IMAGE],
  },
  icons: {
    // App Router also auto-serves src/app/favicon.ico, src/app/icon.png
    // and src/app/apple-icon.png by filename convention, but these are
    // listed explicitly too — matching how the rest of this file's
    // metadata is hand-specified rather than left to convention — so the
    // full icon set survives even if a crawler or client only reads
    // <link rel> tags rather than resolving Next's file-based icons.
    icon: [
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon.png', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
  manifest: '/site.webmanifest',
  other: {
    'impact-site-verification': 'c168f3c5-519c-42fa-a56a-61a670276ba4',
  },
  verification: {
    google: 'M3c6R_aFiZNIgqVpjNK4npRvuim9F5IqSULCgjDFOWI',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={`${geistSans.variable} ${geistMono.variable} h-full`}>
      <body className="min-h-full flex flex-col" style={{ backgroundColor: '#F5F5F0' }}>
        {/* Site-wide structured data — WebSite (enables a sitelinks search box)
            and Organization (feeds Google's knowledge panel). */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScript(buildWebsiteSchema()) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScript(buildOrganizationSchema()) }}
        />
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />

        {/* Google Analytics 4 — beforeInteractive so Next.js injects these
            into the document <head> regardless of where they're written in
            this tree. Search Console's "verify via Google Analytics" method
            specifically requires the gtag snippet to be in <head>, not
            <body>; afterInteractive (the previous strategy) rendered it in
            place here in the body, which is why that verification failed. */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-8HE8E2HF4Q"
          strategy="beforeInteractive"
        />
        <Script id="google-analytics" strategy="beforeInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-8HE8E2HF4Q');
          `}
        </Script>
      </body>
    </html>
  )
}
