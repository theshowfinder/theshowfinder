// "Tickets and hotels from": the sellers the site links to, each in its own brand colour, plus the plain-English
// disclosure every affiliate programme asks for. Names, not logos: logos only once taken from each network's brand
// assets. Never "official partners": being an affiliate does not make us one.
const PARTNERS: Array<{ name: string; bg: string; fg?: string }> = [
  { name: 'Ticketmaster', bg: '#026CDF' },
  { name: 'See Tickets', bg: '#e4022d' },
  { name: 'Gigsberg', bg: '#1a1f6e' },
  { name: 'Theatre Tickets Direct', bg: '#7b1e3a' },
  { name: 'Viagogo', bg: '#00a650' },
  { name: 'StubHub', bg: '#400078' },
  { name: 'Vivid Seats', bg: '#02044a' },
  { name: 'Expedia', bg: '#191e3b', fg: '#fddb32' },
]

export default function PartnerStrip() {
  return (
    <section aria-label="Where our tickets and hotels come from" className="border-b border-white/10 pb-8 mb-10">
      <h3 className="text-xs font-extrabold text-white uppercase tracking-widest mb-4">Tickets and hotels from</h3>
      <ul className="flex flex-wrap gap-2">
        {PARTNERS.map(p => (
          <li key={p.name} className="text-xs font-bold rounded-full px-3 py-1.5" style={{ backgroundColor: p.bg, color: p.fg ?? '#ffffff' }}>
            {p.name}
          </li>
        ))}
      </ul>
      <p className="text-sm text-white/60 mt-4 max-w-2xl leading-relaxed">
        We list every seller side by side so you can choose where to buy. We may earn a commission when you buy
        through our links. It never changes the price you pay.{' '}
        <a href="/about#how-we-make-money" className="underline hover:text-white">How we make money</a>
      </p>
    </section>
  )
}
