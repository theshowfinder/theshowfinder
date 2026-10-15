// A short, plain explanation of how ticket comparison works on a city's shows,
// with a route to the alert sign-up. No provider is promoted here: it describes
// the two kinds of seller and discloses that links can earn a commission.
export default function CityTicketSources({ cityName }: { cityName: string }) {
  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
      <p className="font-bold text-xs uppercase tracking-widest mb-1" style={{ color: '#026CDF' }}>
        Buying tickets
      </p>
      <h2 className="text-2xl font-extrabold text-slate-900 mb-4">
        How we compare tickets for {cityName} shows
      </h2>
      <div className="grid gap-6 sm:grid-cols-2 text-sm text-slate-600 leading-relaxed">
        <div>
          <h3 className="font-bold text-slate-900 mb-1">Official sellers</h3>
          <p>
            Face-value tickets from the promoter&rsquo;s own sellers, such as Ticketmaster, See Tickets,
            Eventim, AXS and Gigantic. Where a show is on sale with one of them, it is listed first.
          </p>
        </div>
        <div>
          <h3 className="font-bold text-slate-900 mb-1">Resale marketplaces</h3>
          <p>
            Fans and dealers reselling on sites like Viagogo, StubHub, Gigsberg and Vivid Seats. Prices can be
            above or below face value, and a sold-out show often only has tickets here.
          </p>
        </div>
      </div>
      <p className="text-xs text-slate-400 mt-5">
        Every show page lists the sellers side by side. We may earn a commission if you buy through our links;
        it never changes the price you pay.
      </p>
      <a
        href="#ticket-alerts"
        className="inline-block mt-4 text-sm font-bold hover:underline"
        style={{ color: '#E8003D' }}
      >
        Get {cityName} ticket alerts →
      </a>
    </section>
  )
}
