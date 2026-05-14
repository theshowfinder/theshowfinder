'use client'

import { useState } from 'react'

const categoryEmoji: Record<string, string> = {
  concert: '🎵', theatre: '🎭', comedy: '😂', sports: '⚽', family: '🎠',
}

interface Props {
  src: string | null
  alt: string
  category: string
}

export default function EventImage({ src, alt, category }: Props) {
  const [errored, setErrored] = useState(false)

  if (!src || errored) {
    return (
      <div className="absolute inset-0 flex items-center justify-center text-5xl bg-slate-50">
        {categoryEmoji[category] ?? '🎟️'}
      </div>
    )
  }

  return (
    // Plain <img> so any CDN domain works without next.config remotePatterns changes.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
      onError={() => setErrored(true)}
      loading="lazy"
    />
  )
}
