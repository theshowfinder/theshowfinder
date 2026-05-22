import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = {
  title: {
    default:  'TheShowFinder — UK Events & Shows',
    template: '%s | TheShowFinder',
  },
  description:
    'Discover the best concerts, theatre, comedy, sports and family shows across the UK. Find tickets and plan your perfect night out.',
  keywords: ['UK events', 'concerts', 'theatre', 'comedy', 'sports', 'family shows', 'tickets'],
  openGraph: {
    title:       'TheShowFinder — UK Events & Shows',
    description: 'Discover the best shows and events across the UK.',
    type:        'website',
    locale:      'en_GB',
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
