import Link from 'next/link'

type MockEvent = {
  day: string
  date: string
  title: string
  venue: string
  category: string
  tone: string
}

type MockBusiness = {
  name: string
  category: string
  description: string
  initials: string
  featured?: boolean
}

const EVENTS: MockEvent[] = [
  { day: 'FRI', date: '14 NOV', title: 'Sam Fender', venue: 'AO Arena', category: 'Live music', tone: 'from-slate-950 to-indigo-900' },
  { day: 'SAT', date: '15 NOV', title: 'The Comedy Store', venue: 'The Lowry', category: 'Comedy', tone: 'from-rose-950 to-orange-800' },
  { day: 'SUN', date: '16 NOV', title: 'Manchester Christmas Markets', venue: 'Albert Square', category: 'Things to do', tone: 'from-emerald-950 to-teal-800' },
]

const ON_SALE = [
  { title: 'The 1975', detail: 'On sale this week', tone: 'from-violet-950 to-fuchsia-800' },
  { title: 'Dua Lipa', detail: 'Tickets released Friday', tone: 'from-blue-950 to-cyan-800' },
  { title: 'Manchester Jazz Festival', detail: 'Early tickets available', tone: 'from-amber-950 to-orange-700' },
]

const BUSINESSES: MockBusiness[] = [
  { name: 'Northern Quarter Kitchen', category: 'Restaurant', description: 'A relaxed pre-show dining spot in the heart of the Northern Quarter.', initials: 'NQ', featured: true },
  { name: 'The Grand Hotel Manchester', category: 'Hotel', description: 'A comfortable city-centre base for nights out and weekends away.', initials: 'GH', featured: true },
  { name: 'Cloud 9 Rooftop Bar', category: 'Bar', description: 'Cocktails, skyline views and a great place to continue the night.', initials: 'C9', featured: true },
  { name: 'The Breakfast Club', category: 'Café', description: 'Coffee, brunch and a quick bite before the show.', initials: 'BC' },
  { name: 'City Centre Cars', category: 'Transport', description: 'Pre-booked journeys to and from Manchester venues.', initials: 'CC' },
  { name: 'The Printworks', category: 'Things to do', description: 'Food, entertainment and late-night options under one roof.', initials: 'PW' },
  { name: 'Northern Quarter Parking', category: 'Parking', description: 'Convenient parking close to Manchester’s main venues.', initials: 'NQ' },
  { name: 'The Style Room', category: 'Beauty', description: 'Hair and beauty appointments before a big night out.', initials: 'SR' },
  { name: 'The Music Shop', category: 'Local business', description: 'Independent records, gifts and music culture in the city.', initials: 'MS' },
]

function EventCard({ event }: { event: MockEvent }) {
  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className={`flex h-36 items-end bg-gradient-to-br ${event.tone} p-5 text-white`}>
        <div>
          <p className="text-xs font-extrabold uppercase tracking-widest text-white/70">{event.category}</p>
          <h3 className="mt-1 text-xl font-extrabold">{event.title}</h3>
        </div>
      </div>
      <div className="flex items-center justify-between gap-4 p-4">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-widest text-rose-600">{event.day} · {event.date}</p>
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
    <article className={`group overflow-hidden rounded-2xl border-2 bg-white shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg ${featured ? 'border-rose-500 ring-2 ring-rose-100' : 'border-slate-200'}`}>
      <div className={`flex items-center justify-between p-5 ${featured ? 'min-h-36 bg-gradient-to-br from-slate-950 via-slate-900 to-rose-950' : 'min-h-28 bg-gradient-to-br from-slate-100 to-slate-200'}`}>
        <span className={`flex h-14 w-14 items-center justify-center rounded-2xl font-extrabold ${featured ? 'bg-white text-rose-600 text-xl' : 'bg-white text-slate-700'}`}>{business.initials}</span>
        <span className={`rounded-full px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider ${featured ? 'bg-white text-rose-600' : 'bg-white/90 text-slate-600'}`}>
          {featured ? 'Featured partner' : 'Local listing'}
        </span>
      </div>
      <div className={featured ? 'p-6' : 'p-5'}>
        <p className={`mb-2 text-xs font-bold uppercase tracking-widest ${featured ? 'text-rose-600' : 'text-slate-400'}`}>{business.category}</p>
        <h3 className="mb-1 text-lg font-extrabold leading-snug text-slate-900 group-hover:text-rose-600">{business.name}</h3>
        <p className="line-clamp-3 text-sm leading-relaxed text-slate-500">{business.description}</p>
        <p className="mt-4 text-sm font-bold text-rose-600">Visit website <span aria-hidden="true">→</span></p>
      </div>
    </article>
  )
}

export default function AdvertisingCityMockup({ cityName = 'Manchester' }: { cityName?: string }) {
  return (
    <main className="min-h-screen bg-[#F5F5F0] text-slate-900">
      <section className="relative overflow-hidden bg-slate-950 px-4 py-12 text-white sm:px-6 sm:py-20">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(232,0,61,0.35),_transparent_45%)]" />
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
              <p className="mt-2 text-sm text-slate-500">A realistic preview of the event-led city hub.</p>
            </div>
            <span className="hidden text-sm font-bold text-rose-600 sm:block">See all events →</span>
          </div>
          <div className="grid gap-5 md:grid-cols-3">{EVENTS.map(event => <EventCard key={event.title} event={event} />)}</div>
        </section>

        <section>
          <div className="mb-7">
            <p className="mb-1 text-xs font-bold uppercase tracking-widest text-blue-600">Tickets just released</p>
            <h2 className="text-3xl font-extrabold tracking-tight">On sale this week</h2>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {ON_SALE.map(item => (
              <article key={item.title} className={`rounded-2xl bg-gradient-to-br ${item.tone} p-6 text-white shadow-sm`}>
                <p className="text-xs font-extrabold uppercase tracking-widest text-white/65">{item.detail}</p>
                <h3 className="mt-10 text-2xl font-extrabold">{item.title}</h3>
                <p className="mt-4 text-sm font-bold text-white/80">Explore tickets →</p>
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
            {BUSINESSES.filter(business => business.featured).map(business => <BusinessCard key={business.name} business={business} />)}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {BUSINESSES.filter(business => !business.featured).map(business => <BusinessCard key={business.name} business={business} />)}
          </div>
          <p className="mt-4 text-xs text-slate-400">Featured partners appear first. Placements are limited to nine businesses per city.</p>
        </section>

        <section className="rounded-3xl bg-slate-950 p-7 text-white sm:p-10">
          <div className="max-w-3xl">
            <p className="text-xs font-extrabold uppercase tracking-widest text-rose-300">For local businesses</p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">Put your business in front of people planning a night out.</h2>
            <p className="mt-4 text-base leading-relaxed text-white/70">Choose a standard listing or one of the three featured placements in your city. The layout stays limited, clear and easy to understand.</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href={`/advertise/join?city=${encodeURIComponent(cityName)}&package=featured`} className="rounded-xl bg-rose-500 px-5 py-3 text-sm font-extrabold text-white hover:bg-rose-400">Ask about featured placement</Link>
              <Link href={`/advertise/join?city=${encodeURIComponent(cityName)}&package=standard`} className="rounded-xl bg-white/10 px-5 py-3 text-sm font-extrabold text-white hover:bg-white/20">Choose standard listing</Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
