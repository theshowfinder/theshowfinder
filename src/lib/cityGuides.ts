// Short, genuinely-researched narrative intros for city pages — the "thin
// content" gap flagged in the 2026-09-25 monetization notes: city pages
// were pure database listings with zero descriptive text about the city
// itself, which both reads thin to visitors and gives search engines
// nothing but boilerplate to differentiate one city page from another for
// queries like "concerts in <city>".
//
// Each entry must be based on real, checked facts (venue names, capacities,
// what they're known for) — never invented. Only add a city here once it's
// been properly researched; a city with no entry here just doesn't render
// the "About {city}'s live scene" section, which is fine and expected for
// the 35 cities not yet written.
//
// Written 2026-09-29, starting with Derby as the pilot (see
// claude/local-hub-pilot-2026-09-29.md in the project for the wider local
// content push this belongs to).
export const CITY_GUIDE_INTROS: Record<string, string> = {
  Derby: `Derby's live scene centres on Becketwell in the city centre, home to Vaillant Live — a 3,500-capacity venue for concerts, comedy and family shows that opened in 2025 and quickly became the city's biggest draw. For a smaller, gig-going crowd, The Flowerpot and The Hairy Dog are Derby's long-standing live music venues, both a short walk from the centre. Derby Theatre covers drama and touring shows, while just outside the city, Donington Park hosts major motorsport events and festivals including Download. Derby Arena adds a multi-use venue for bigger sporting fixtures. Whatever the show, TheShowFinder tracks tickets across every major provider so you can compare prices before you buy.`,
}
