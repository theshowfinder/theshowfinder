import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 's1.ticketm.net'            },
      { protocol: 'https', hostname: 'resizing.ticketmaster.com' },
      { protocol: 'https', hostname: 'media.ticketmaster.com'    },
      { protocol: 'https', hostname: '**.ticketmaster.com'       },
      { protocol: 'https', hostname: '**.livenation.com'         },
      { protocol: 'https', hostname: 'images.universe.com'       },
    ],
  },
  // Keep /venues/<slug> free of searchParams so it can be CDN-cached. The
  // pagination links (/venues/<slug>?page=2) keep working: they are rewritten
  // internally to /venues/<slug>/p/2 without changing the visible URL.
  async rewrites() {
    return [
      {
        source: '/venues/:slug',
        has: [{ type: 'query', key: 'page', value: '(?<n>[0-9]+)' }],
        destination: '/venues/:slug/p/:n',
      },
    ]
  },
}

export default nextConfig
