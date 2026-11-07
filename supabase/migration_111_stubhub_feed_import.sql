-- StubHub joins the automatic import of shows we do not list (starts in dry mode: counts, creates nothing).
alter table public.feed_import_state add column if not exists stubhub_mode text check (stubhub_mode in ('off','dry','live'));
update public.feed_import_state set stubhub_mode = coalesce(stubhub_mode, 'dry') where id = 1;
