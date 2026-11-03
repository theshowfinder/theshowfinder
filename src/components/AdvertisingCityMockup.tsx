import Link from 'next/link'

/** A real upcoming show in the city (from the listings), for the mock-up's event rows. */
export type MockEvent = { title: string; venue: string; category: string; startIso: string; image: string }
/** A real show on sale this week (or just announced) in the city. */
export type MockOnSale = { title: string; detail: string; image: string }

type MockBusiness = {
  name: string
  category: string
  description: string
  initials: string
  image: string
  featured?: boolean
}

const TONES = ['from-slate-950 to-indigo-900', 'from-rose-950 to-orange-800', 'from-emerald-950 to-teal-800', 'from-violet-950 to-fuchsia-800', 'from-blue-950 to-cyan-800', 'from-amber-950 to-orange-700']

// Sample partners: neutral names that read naturally in any city. The visiting business replaces the first one.
function sampleBusinesses(city: string, hero: string): MockBusiness[] {
  return [
    { name: 'The Station Kitchen', category: 'Restaurant', description: 'A relaxed pre-show dining spot a short walk from the main venues.', initials: 'SK', image: '/event-fallbacks/family.webp', featured: true },
    { name: `The ${city} Grand Hotel`, category: 'Hotel', description: 'A comfortable city-centre base for nights out and weekends away.', initials: 'GH', image: hero, featured: true },
    { name: 'Skyline Rooftop Bar', category: 'Bar', description: 'Cocktails, skyline views and a great place to continue the night.', initials: 'SB', image: '/social-backgrounds/concert-city-night.png', featured: true },
    { name: 'The Breakfast Club', category: 'Café', description: 'Coffee, brunch and a quick bite before the show.', initials: 'BC', image: '/event-fallbacks/family.webp' },
    { name: 'City Centre Cars', category: 'Transport', description: `Pre-booked journeys to and from ${city} venues.`, initials: 'CC', image: hero },
    { name: 'The Late Social', category: 'Things to do', description: 'Food, entertainment and late-night options under one roof.', initials: 'LS', image: '/event-fallbacks/comedy.webp' },
    { name: 'Venue Side Parking', category: 'Parking', description: `Convenient parking close to ${city}’s main venues.`, initials: 'VP', image: hero },
    { name: 'The Style Room', category: 'Beauty', description: 'Hair and beauty appointments before a big night out.', initials: 'SR', image: '/event-fallbacks/theatre.webp' },
    { name: 'The Music Shop', category: 'Local business', description: 'Independent records, gifts and music culture in the city.', initials: 'MS', image: '/social-backgrounds/concert-cinematic-v2.png' },
  ]
}

function EventCard({ event, tone }: { event: MockEvent; tone: string }) {
  const d = new Date(event.startIso)
  const day = d.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'Europe/London' }).toUpperCase()
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' }).toUpperCase()
  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className={`relative flex h-44 items-end overflow-hidden bg-gradient-to-br ${tone} p-5 text-white`}>
        <img src={event.image} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover opacity-80" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/20 to-transparent" />
        <div className="relative">
          <p className="text-xs font-extrabold uppercase tracking-widest text-white/75">{event.category}</p>
          <h3 className="mt-1 text-xl font-extrabold">{event.title}</h3>
        </div>
      </div>
      <div className="flex items-center justify-between gap-4 p-4">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-widest text-rose-600">{day} · {date}</p>
          <p className="mt-1 text-sm font-semibold text-slate-700">{event.venue}</p>
        </div>
        <span className="text-sm font-bold text-rose-600">View →</span>
      </div>
    </article>
  )
}

function BusinessCard({ business }: { business: MockBusiness }) {
  const featured = business.featured === true
  return (
    <article className={`group overflow-hidden rounded-2xl bg-white transition-all duration-200 hover:-translate-y-1 ${featured
      ? 'border-2 border-slate-950 shadow-xl ring-4 ring-amber-200/80'
      : 'border border-slate-200 shadow-sm'}`}>
      {featured && (
        <div className="flex items-center justify-between bg-slate-950 px-5 py-2.5 text-[11px] font-extrabold uppercase tracking-[0.16em] text-amber-200">
          <span>Featured placement</span>
          <span>Premium visibility</span>
        </div>
      )}
      <div className={`relative overflow-hidden ${featured ? 'min-h-56' : 'min-h-28'}`}>
        <img src={business.image} alt="" aria-hidden="true" className={`absolute inset-0 h-full w-full object-cover ${featured ? 'scale-105' : ''}`} />
        <div className={`absolute inset-0 ${featured
          ? 'bg-gradient-to-br from-slate-950/80 via-slate-900/30 to-amber-950/75'
          : 'bg-gradient-to-br from-slate-950/60 to-slate-900/15'}`} />
        <div className="relative flex h-full min-h-[inherit] items-center justify-between p-5">
          <span className={`flex items-center justify-center rounded-2xl font-extrabold shadow-lg ${featured
            ? 'h-20 w-20 bg-white text-2xl text-slate-950'
            : 'h-12 w-12 bg-white text-slate-700'}`}>{business.initials}</span>
          <span className={`rounded-full px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider ${featured
            ? 'bg-amber-200 text-slate-950'
            : 'bg-white/90 text-slate-600'}`}>
            {featured ? 'Featured partner' : 'Local listing'}
          </span>
        </div>
      </div>
      <div className={featured ? 'p-7' : 'p-4'}>
        <p className={`mb-2 text-xs font-bold uppercase tracking-widest ${featured ? 'text-amber-700' : 'text-slate-400'}`}>{business.category}</p>
        <h3 className={`mb-1 font-extrabold leading-snug text-slate-900 group-hover:text-rose-600 ${featured ? 'text-xl' : 'text-base'}`}>{business.name}</h3>
        <p className={`leading-relaxed text-slate-500 ${featured ? 'text-sm' : 'line-clamp-2 text-xs'}`}>{business.description}</p>
        <p className={`font-bold text-rose-600 ${featured ? 'mt-5 text-sm' : 'mt-3 text-xs'}`}>Visit website <span aria-hidden="true">→</span></p>
      </div>
    </article>
  )
}
/** A business reached by outreach: shown in the first Featured slot so they see exactly how they would look. */
export type MockupPreview = { name: string; category: string }

export default function AdvertisingCityMockup({ cityName = 'Manchester', heroImage = '/city-heroes/manchester.webp', events = [], onSale = [], preview = null, refCode = '' }: { cityName?: string; heroImage?: string; events?: MockEvent[]; onSale?: MockOnSale[]; preview?: MockupPreview | null; refCode?: string }) {
  const BUSINESSES = sampleBusinesses(cityName, heroImage)
  const initials = (name: string) => name.replace(/[^A-Za-z0-9 ]/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || 'YB'
  const businesses: MockBusiness[] = preview
    ? [{ name: preview.name, category: preview.category, description: 'Your description, offer and booking link, shown right under the ticket buttons when people plan their night.', initials: initials(preview.name), image: heroImage, featured: true }, ...BUSINESSES.filter(b => b.featured).slice(1), ...BUSINESSES.filter(b => !b.featured)]
    : BUSINESSES
  const onboard = (pkg: 'featured' | 'standard') => `/advertise/onboard?${new URLSearchParams({ city: cityName, package: pkg, ...(refCode ? { ref: refCode } : {}) }).toString()}`
  return (
    <main className="min-h-screen bg-[#F5F5F0] text-slate-900">
      {preview && (
        <div className="bg-rose-600 text-white">
          <div className="mx-auto max-w-7xl px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-sm font-bold">
            <span>This is how {preview.name} would appear on TheShowFinder {cityName}.</span>
            <a href="#packages" className="rounded-lg bg-white px-3 py-1.5 text-rose-700">Choose your placement ↓</a>
          </div>
        </div>
      )}
      <section className="relative overflow-hidden bg-slate-950 px-4 py-12 text-white sm:px-6 sm:py-20">
        <img src={heroImage} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover opacity-45" />
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/75 to-rose-950/35" />
        <div className="relative mx-auto max-w-7xl">
          <p className="mb-4 text-xs font-extrabold uppercase tracking-[0.25em] text-rose-300">TheShowFinder city hub</p>
          <h1 className="max-w-3xl text-4xl font-extrabold tracking-tight sm:text-6xl">Everything happening in {cityName}</h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/70 sm:text-lg">
            Live events, things to do and trusted local businesses to help visitors make the most of their night.
          </p>
          <div className="mt-8 flex flex-wrap gap-3 text-sm font-bold">
            <span className="rounded-full bg-white/10 px-4 py-2">Events tonight</span>
            <span className="rounded-full bg-white/10 px-4 py-2">This week</span>
            <span className="rounded-full bg-white/10 px-4 py-2">Local partners</span>
          </div>
        </div>
      </section>

      <div className="mx-auto flex max-w-7xl flex-col gap-14 px-4 py-10 sm:px-6 sm:py-14">
        <section>
          <div className="mb-7 flex items-end justify-between gap-4">
            <div>
              <p className="mb-1 text-xs font-bold uppercase tracking-widest text-rose-600">Top events</p>
              <h2 className="text-3xl font-extrabold tracking-tight">What’s on in {cityName}</h2>
              <p className="mt-2 text-sm text-slate-500">Real upcoming shows in {cityName}, as they appear on the site.</p>
            </div>
            <span className="hidden text-sm font-bold text-rose-600 sm:block">See all events →</span>
          </div>
          <div className="grid gap-5 md:grid-cols-3">{events.map((event, i) => <EventCard key={event.title + event.startIso} event={event} tone={TONES[i % TONES.length]} />)}</div>
        </section>

        <section>
          <div className="mb-7">
            <p className="mb-1 text-xs font-bold uppercase tracking-widest text-blue-600">Tickets just released</p>
            <h2 className="text-3xl font-extrabold tracking-tight">On sale this week</h2>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {onSale.map((item, i) => (
              <article key={item.title} className={`relative min-h-48 overflow-hidden rounded-2xl bg-gradient-to-br ${TONES[(i + 3) % TONES.length]} p-6 text-white shadow-sm`}>
                <img src={item.image} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover opacity-60" />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/20 to-transparent" />
                <div className="relative">
                  <p className="text-xs font-extrabold uppercase tracking-widest text-white/70">{item.detail}</p>
                  <h3 className="mt-16 text-2xl font-extrabold">{item.title}</h3>
                  <p className="mt-4 text-sm font-bold text-white/85">Explore tickets →</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="local-partners-heading">
          <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="mb-1 text-xs font-bold uppercase tracking-widest text-rose-600">Local partners</p>
              <h2 id="local-partners-heading" className="text-3xl font-extrabold tracking-tight">Make more of your night in {cityName}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">Places to eat, drink, stay and get ready near the action.</p>
            </div>
            <Link href={`/advertise?city=${encodeURIComponent(cityName)}`} className="shrink-0 text-sm font-bold text-rose-600 hover:underline">
              Advertise your business <span aria-hidden="true">→</span>
            </Link>
          </div>
          <div className="mb-5 grid gap-5 md:grid-cols-3">
            {businesses.filter(business => business.featured).map(business => <BusinessCard key={business.name} business={business} />)}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {businesses.filter(business => !business.featured).map(business => <BusinessCard key={business.name} business={business} />)}
          </div>
          <p className="mt-4 text-xs text-slate-400">Featured partners appear first. Placements are limited to nine businesses per city.</p>
        </section>

        <section id="packages" className="scroll-mt-16 rounded-3xl bg-slate-950 p-7 text-white sm:p-10">
          <div className="max-w-3xl">
            <p className="text-xs font-extrabold uppercase tracking-widest text-rose-300">For local businesses</p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">Put your business in front of people planning a night out.</h2>
            <p className="mt-4 text-base leading-relaxed text-white/70">Choose a standard listing or one of the three featured placements in your city. The layout stays limited, clear and easy to understand.</p>
            <div className="mt-7 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/15 bg-white/10 p-5">
              <p className="text-xs font-extrabold uppercase tracking-widest text-rose-300">Featured placement</p>
              <p className="mt-2 text-2xl font-black">£44.95<span className="text-sm font-bold text-white/60">/month</span></p>
              <p className="mt-1 text-xs text-white/60">£449.95 annually · introductory city rate</p>
              <Link href={onboard('featured')} className="mt-4 inline-flex rounded-xl bg-rose-500 px-4 py-2.5 text-sm font-extrabold text-white hover:bg-rose-400">Secure featured placement →</Link>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/5 p-5">
              <p className="text-xs font-extrabold uppercase tracking-widest text-white/60">Standard listing</p>
              <p className="mt-2 text-2xl font-black">£29.95<span className="text-sm font-bold text-white/60">/month</span></p>
              <p className="mt-1 text-xs text-white/60">£299.95 annually · introductory city rate</p>
              <Link href={onboard('standard')} className="mt-4 inline-flex rounded-xl bg-white/10 px-4 py-2.5 text-sm font-extrabold text-white hover:bg-white/20">Secure standard listing →</Link>
            </div>
          </div>
          <p className="mt-5 text-xs font-semibold text-white/60">Only nine positions are available in this city. The displayed introductory rate is subject to availability and will be reviewed after the launch allocation is filled.</p>
          </div>
        </section>
      </div>
    </main>
  )
}
