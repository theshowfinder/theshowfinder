import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

const BASE_URL = 'https://www.theshowfinder.com'
const OG_IMAGE  = `${BASE_URL}/og-image.png`

export const metadata: Metadata = {
  title: {
    default:  'TheShowFinder — UK Events & Ticket Comparison',
    template: '%s | TheShowFinder',
  },
  description:
    'Discover the best UK events and compare tickets from Ticketmaster, See Tickets, Viagogo and more.',
  keywords: ['UK events', 'concerts', 'theatre', 'comedy', 'sports', 'family shows', 'tickets'],
  metadataBase: new URL(BASE_URL),
  openGraph: {
    title:       'TheShowFinder — UK Events & Ticket Comparison',
    description: 'Discover the best UK events and compare tickets from Ticketmaster, See Tickets, Viagogo and more.',
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
    title:       'TheShowFinder — UK Events & Ticket Comparison',
    description: 'Discover the best UK events and compare tickets from Ticketmaster, See Tickets, Viagogo and more.',
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
      </body>
    </html>
  )
}
