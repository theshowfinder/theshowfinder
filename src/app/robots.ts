import type { MetadataRoute } from 'next'

const BASE_URL = 'https://www.theshowfinder.com'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/admin/', '/embed/', '/out/'],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  }
}
