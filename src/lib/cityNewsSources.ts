export interface CityNewsSource {
  city: string
  source: string
  url: string
  kind: 'publisher' | 'council' | 'culture'
  enabled: boolean
}

// Phase 1 registry: only endpoints verified during the October 2026 source audit.
// These sources feed city pages only. The homepage news_stories pipeline is separate.
export const CITY_NEWS_SOURCES: CityNewsSource[] = [
  { city: 'London', source: 'Londonist', url: 'https://londonist.com/feed', kind: 'culture', enabled: true },
  { city: 'Manchester', source: 'Manchester Evening News', url: 'https://www.manchestereveningnews.co.uk/news/?service=rss', kind: 'publisher', enabled: true },
  { city: 'Liverpool', source: 'Liverpool Echo', url: 'https://www.liverpoolecho.co.uk/whats-on/?service=rss', kind: 'publisher', enabled: true },
  { city: 'Leeds', source: 'Leeds City Council', url: 'https://news.leeds.gov.uk/feed/rss', kind: 'council', enabled: true },
  { city: 'York', source: 'York Press', url: 'https://yorkpress.co.uk/news/rss', kind: 'publisher', enabled: true },
  { city: 'Birmingham', source: 'Birmingham Live', url: 'https://www.birminghammail.co.uk/whats-on/?service=rss', kind: 'publisher', enabled: true },
  { city: 'Nottingham', source: 'Nottingham Post', url: 'https://www.nottinghampost.com/whats-on/?service=rss', kind: 'publisher', enabled: true },
  { city: 'Leicester', source: 'Leicester Mercury', url: 'https://www.leicestermercury.co.uk/whats-on/?service=rss', kind: 'publisher', enabled: true },
  { city: 'Derby', source: 'Derby Telegraph', url: 'https://www.derbytelegraph.co.uk/whats-on/?service=rss', kind: 'publisher', enabled: true },
  { city: 'Coventry', source: 'Coventry Telegraph', url: 'https://www.coventrytelegraph.net/whats-on/?service=rss', kind: 'publisher', enabled: true },
  { city: 'Stoke-on-Trent', source: 'Stoke Sentinel', url: 'https://www.stokesentinel.co.uk/?service=rss', kind: 'publisher', enabled: true },
  { city: 'Bristol', source: 'Bristol24/7', url: 'https://www.bristol247.com/feed/', kind: 'culture', enabled: true },
  { city: 'Southampton', source: 'SUSU What's On', url: 'https://www.susu.org/feeds/whatson.xml', kind: 'culture', enabled: true },
  { city: 'Oxford', source: 'Oxford City Council', url: 'https://www.oxford.gov.uk/rss/news', kind: 'council', enabled: true },
  { city: 'Oxford', source: 'Oxford Mail', url: 'https://www.oxfordmail.co.uk/news/rss/', kind: 'publisher', enabled: true },
  { city: 'Edinburgh', source: 'Edinburgh News', url: 'https://edinburghnews.scotsman.com/rss', kind: 'publisher', enabled: true },
  { city: 'Glasgow', source: 'Glasgow Live', url: 'https://www.glasgowlive.co.uk/?service=rss', kind: 'publisher', enabled: true },
  { city: 'Belfast', source: 'Belfast Live', url: 'https://www.belfastlive.co.uk/?service=rss', kind: 'publisher', enabled: true },
  { city: 'Belfast', source: 'News Letter', url: 'https://www.newsletter.co.uk/rss', kind: 'publisher', enabled: true },
  { city: 'Derry', source: 'Derry Journal', url: 'https://www.derryjournal.com/rss', kind: 'publisher', enabled: true },
]

export function cityNewsSourcesFor(city: string): CityNewsSource[] {
  return CITY_NEWS_SOURCES.filter(source => source.enabled && source.city === city)
}
