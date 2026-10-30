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
      // Gigsberg performer photos, used on shows imported from the Gigsberg catalogue (event page hero).
      { protocol: 'https', hostname: 'www.gigsberg.com'          },
      { protocol: 'https', hostname: 'gigsberg.com'              },
      // Stephen Joseph Theatre (Scarborough) blocks hotlinked images, so ours are served through /_next/image.
      { protocol: 'https', hostname: 'sjt.uk.com'                },
    ],
  },
  // Keep /venues/<slug> free of searchParams so it can be CDN-cached. The
  // pagination links (/venues/<slug>?page=2) keep working: they are rewritten
  // internally to /venues/<slug>/p/2 without changing the visible URL.
  // Security headers on every response. Framing: our pages may only be framed by
  // ourselves (stops clickjacking, e.g. of /admin), EXCEPT /embed/*, the free
  // widget that other sites are meant to put in an iframe. Permissions-Policy only
  // switches off features the site never uses (clipboard and Web Share, used by
  // the share/copy buttons, are not affected). HSTS is already sent by Vercel.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
        ],
      },
      ...['/', '/:path((?!embed/).*)'].map(source => ({
        source,
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
        ],
      })),
    ]
  },
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
