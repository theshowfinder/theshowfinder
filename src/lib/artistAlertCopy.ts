// Wording for the artist alert card (components/ArtistAlertCard.tsx). Plain
// module so server pages can pick the copy and node --test can check it.

export function artistAlertCopy(name: string, opts: { hasDates?: boolean; soldOut?: boolean }): { heading: string; blurb: string } {
  if (opts.soldOut) {
    return {
      heading: `Sold out? Don't miss the next ${name} dates`,
      blurb: `We'll email you as soon as new ${name} dates are announced, so you can be ready when the presale opens.`,
    }
  }
  if (opts.hasDates === false) {
    return {
      heading: `Get ${name} tour alerts`,
      blurb: `No UK dates right now. We'll email you the moment ${name} announces some, so you can be first in the queue.`,
    }
  }
  return {
    heading: `Get ${name} presale alerts`,
    blurb: `Popular dates sell out fast. We'll email you as soon as new ${name} dates are announced, so you're ready for the presale.`,
  }
}
