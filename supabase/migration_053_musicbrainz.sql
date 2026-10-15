-- MusicBrainz enrichment: remember each artist's MusicBrainz id (taken from the
-- link Ticketmaster lists for that attraction) and whether we've looked it up.
alter table public.artists
  add column if not exists musicbrainz_id text,
  add column if not exists musicbrainz_checked_at timestamptz;

create index if not exists artists_musicbrainz_pending_idx
  on public.artists (id)
  where musicbrainz_id is not null and musicbrainz_checked_at is null;

-- Re-queue artists already enriched before this column existed so the nightly
-- job captures their MusicBrainz id. Existing bio/genre/website are never overwritten.
update public.artists set enriched_at = null
where enriched_at is not null and musicbrainz_id is null;
