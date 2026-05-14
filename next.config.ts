import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 's1.ticketm.net'            },
      { protocol: 'https', hostname: 'resizing.ticketmaster.com' },
      { protocol: 'https', hostname: 'media.ticketmaster.com'    },
      { protocol: 'https', hostname: '**.ticketmaster.com'       },
      { protocol: 'https', hostname: '**.livenation.com'         },
    ],
  },
}

export default nextConfig
