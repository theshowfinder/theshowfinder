<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Working together: Chris, Claude and ChatGPT

Two AI assistants work on this repo, sometimes at the same time: Claude (Cowork, which commits on Chris's Mac) and ChatGPT/Codex (which works on a branch and opens a pull request). These rules keep them from treading on each other. Both must follow them.

## Before you start
- Get the latest `main` first (`git pull --rebase origin main`). Never start work on a stale copy.
- Read `git log --oneline -15` to see what the other assistant changed recently. Commit messages are the shared log.

## Git
- Commit as `theshowfinder <chris.spence73@gmail.com>`. Never change git config. Never add Co-Authored-By or any other trailer.
- One job per commit or pull request, with a plain-English message that says what changed and why. Chris reads these.
- Codex: always work on a branch and open a pull request. Never push straight to `main`.
- Before pushing to `main`, Chris runs `git pull --rebase origin main && git push origin main`.

## Who does what (Chris can change this)
- Claude: data and automation. Ticketmaster sync, Gigsberg and See Tickets feeds and matching, crons, the news job, database migrations, admin tools, SEO plumbing.
- ChatGPT: wording, copy and page layout or styling on public pages.
- Anything outside your area, or a file the other assistant changed in the last day: say so in the pull request or commit so Chris knows.

## Content lives in the database, not in page code
- Events, artists, venues and news stories come from Supabase and automated jobs (the `news_stories` table is filled by the news job).
- Never hardcode text, dates or fixes for a single artist, event or story inside a page component. It goes stale and the automation can't update it. Wording for a single story belongs in the database. If there is no field for it yet, say so instead of hardcoding it.

## Database
- Only change the schema through a new `supabase/migration_NNN_<name>.sql`. Check the highest existing number first, because both assistants can pick the same one. Follow the grant rule in CLAUDE.md.
- Visitor listings only show live events (`LIVE_EVENT_STATUSES`: upcoming, on_sale, sold_out). Duplicates are hidden through `event_canonical_map` / `listed_events_with_venue`. Ticketmaster often cancels a listing and re-lists the show under a new id, so a cancelled row is never a link target.

## Never
- Remove or rename ticket-provider buttons, or change the `/out/<provider>` affiliate hop links. Commissions depend on them.
- Block real visitors from reaching sellers.
- Delete events or data rows. Mark them instead (status, `gone_at`, `match_status = 'rejected'`).
- Send emails to people. The news alerts stay in preview until Chris says otherwise.

## Before committing
- Run `npm test` and `npm run lint`. Both must pass.

## Build for the target size (Chris, 30 Oct 2026)
The plan is every UK event 12 months ahead (40,000+ shows), then Europe and the US, with search engines and bots
crawling every page. Build for that from the start, never for what is in the database today. Before handing over:
1. **Never rebuild or invalidate the whole site.** No `revalidatePath('/events', 'layout')`, `'/venues/[slug]'`
   or similar. Rebuild only the pages a change touches (`revalidateEventPages` / `revalidateChangedShowPages` in
   `src/lib/changedPages.ts`). Event, artist and venue pages are cached for a week and rebuilt when their show changes.
2. **Cost per visit.** Assume every page is crawled daily. A change must not make a page rebuild on a timer shorter
   than its data changes, or run database work per visit that could run once a night. Vercel must stay under $50/month.
3. **Admin buttons answer in seconds** and show they are working (`src/components/admin/PendingButton.tsx`).
   Whole-table work (refresh_event_canonical, sweeps) belongs in the scheduled jobs, never behind a button.
4. **Test at 50,000 shows**: queries filtered and limited, no loading whole tables into a page.
5. **Phone first**: check every page change at phone width before it ships.
6. **One place for each job**: look for existing code that does it and change that, so a fix lands everywhere.
