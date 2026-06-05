import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import Script from 'next/script'
import './globals.css'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

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
  other: {
    'impact-site-verification': 'c168f3c5-519c-42fa-a56a-61a670276ba4',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={`${geistSans.variable} ${geistMono.variable} h-full`}>
      <body className="min-h-full flex flex-col" style={{ backgroundColor: '#F5F5F0' }}>
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />

        {/* Google Analytics 4 */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-8HE8E2HF4Q"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
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
