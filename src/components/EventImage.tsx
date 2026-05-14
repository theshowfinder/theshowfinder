'use client'

import Image from 'next/image'
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
    <Image
      src={src}
      alt={alt}
      fill
      className="object-cover group-hover:scale-105 transition-transform duration-300"
      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
      onError={() => setErrored(true)}
    />
  )
}
