-- ============================================================
-- TheShowFinder — Database Schema
-- ============================================================

-- Enable required extensions
create extension if not exists "uuid-ossp";
create extension if not exists "postgis";  -- for geo queries (optional, remove if not available)

-- ============================================================
-- ENUMS
-- ============================================================

create type event_category as enum ('concert', 'theatre', 'comedy', 'sports', 'family');
create type event_status   as enum ('upcoming', 'on_sale', 'sold_out', 'cancelled', 'postponed');

-- ============================================================
-- PROFILES  (extends auth.users)
-- ============================================================

create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text,
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Auto-create profile on sign-up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- VENUES
-- ============================================================

create table public.venues (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  slug        text not null unique,
  address     text not null,
  city        text not null,
  postcode    text not null,
  country     text not null default 'GB',
  capacity    integer,
  lat         double precision,
  lng         double precision,
  website     text,
  image_url   text,
  created_at  timestamptz not null default now()
);

alter table public.venues enable row level security;

create policy "Venues are publicly readable"
  on public.venues for select using (true);

create index venues_city_idx  on public.venues (city);
create index venues_slug_idx  on public.venues (slug);

-- ============================================================
-- ARTISTS
-- ============================================================

create table public.artists (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  slug        text not null unique,
  bio         text,
  genre       text,
  image_url   text,
  website     text,
  spotify_id  text,
  created_at  timestamptz not null default now()
);

alter table public.artists enable row level security;

create policy "Artists are publicly readable"
  on public.artists for select using (true);

create index artists_slug_idx  on public.artists (slug);
create index artists_genre_idx on public.artists (genre);

-- ============================================================
-- EVENTS
-- ============================================================

create table public.events (
  id           uuid primary key default uuid_generate_v4(),
  title        text not null,
  slug         text not null unique,
  description  text,
  category     event_category not null,
  venue_id     uuid not null references public.venues(id) on delete restrict,
  start_date   timestamptz not null,
  end_date     timestamptz,
  doors_time   timestamptz,
  image_url    text,
  price_from   numeric(10, 2),
  price_to     numeric(10, 2),
  currency     text not null default 'GBP',
  tickets_url  text,
  status       event_status not null default 'upcoming',
  is_featured  boolean not null default false,
  tags         text[],
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.events enable row level security;

create policy "Events are publicly readable"
  on public.events for select using (true);

create index events_category_idx    on public.events (category);
create index events_start_date_idx  on public.events (start_date);
create index events_venue_idx       on public.events (venue_id);
create index events_status_idx      on public.events (status);
create index events_featured_idx    on public.events (is_featured) where is_featured = true;
create index events_tags_idx        on public.events using gin (tags);
create index events_slug_idx        on public.events (slug);

-- Auto-update updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger events_updated_at
  before update on public.events
  for each row execute procedure public.set_updated_at();

-- ============================================================
-- EVENT ↔ ARTISTS  (junction)
-- ============================================================

create table public.event_artists (
  event_id     uuid not null references public.events(id)  on delete cascade,
  artist_id    uuid not null references public.artists(id) on delete cascade,
  is_headliner boolean not null default false,
  "order"      integer not null default 0,
  primary key (event_id, artist_id)
);

alter table public.event_artists enable row level security;

create policy "Event artists are publicly readable"
  on public.event_artists for select using (true);

-- ============================================================
-- USER FAVOURITES
-- ============================================================

create table public.user_favorites (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  event_id   uuid not null references public.events(id)   on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, event_id)
);

alter table public.user_favorites enable row level security;

create policy "Users can manage their own favourites"
  on public.user_favorites for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- CONVENIENCE VIEW
-- ============================================================

create or replace view public.events_with_venue as
  select
    e.id,
    e.title,
    e.slug,
    e.description,
    e.category,
    e.start_date,
    e.end_date,
    e.image_url,
    e.price_from,
    e.price_to,
    e.currency,
    e.tickets_url,
    e.status,
    e.is_featured,
    v.id   as venue_id,
    v.name as venue_name,
    v.city as venue_city,
    v.postcode as venue_postcode
  from public.events e
  join public.venues v on e.venue_id = v.id;

-- ============================================================
-- SEED DATA  (sample events for development)
-- ============================================================

-- Venues
insert into public.venues (name, slug, address, city, postcode, capacity) values
  ('The O2',                  'the-o2',                  'Peninsula Square',          'London',     'SE10 0DX', 20000),
  ('Manchester Arena',        'manchester-arena',         'Victoria Station',          'Manchester', 'M3 1AR',   21000),
  ('SSE Hydro',               'sse-hydro',                'Exhibition Way',            'Glasgow',    'G3 8YW',   13000),
  ('Royal Albert Hall',       'royal-albert-hall',        'Kensington Gore',           'London',     'SW7 2AP',   5272),
  ('Birmingham Hippodrome',   'birmingham-hippodrome',    'Hurst St, Southside',       'Birmingham', 'B5 4TB',    1800),
  ('Edinburgh Playhouse',     'edinburgh-playhouse',      '18-22 Greenside Place',     'Edinburgh',  'EH1 3AA',   3059),
  ('Wembley Stadium',         'wembley-stadium',          'Wembley',                   'London',     'HA9 0WS',  90000),
  ('Cardiff International Arena', 'cardiff-arena',        'Mary Ann Street',           'Cardiff',    'CF10 2EQ',  7500);

-- Artists
insert into public.artists (name, slug, genre) values
  ('Coldplay',      'coldplay',      'Rock'),
  ('Adele',         'adele',         'Pop/Soul'),
  ('Ed Sheeran',    'ed-sheeran',    'Pop'),
  ('The 1975',      'the-1975',      'Indie Rock'),
  ('Dua Lipa',      'dua-lipa',      'Pop'),
  ('Arctic Monkeys','arctic-monkeys','Indie Rock');

-- Events
insert into public.events (title, slug, category, venue_id, start_date, price_from, price_to, status, is_featured, description) values
  (
    'Coldplay: Music of the Spheres World Tour',
    'coldplay-music-of-the-spheres-2026',
    'concert',
    (select id from public.venues where slug = 'wembley-stadium'),
    '2026-07-15 19:30:00+00',
    85.00, 250.00,
    'on_sale', true,
    'Coldplay bring their record-breaking world tour to Wembley Stadium for three stunning nights.'
  ),
  (
    'Hamilton',
    'hamilton-london-2026',
    'theatre',
    (select id from public.venues where slug = 'royal-albert-hall'),
    '2026-06-01 19:30:00+00',
    35.00, 175.00,
    'on_sale', true,
    'The award-winning musical phenomenon returns to the West End.'
  ),
  (
    'Peter Kay Live',
    'peter-kay-live-manchester-2026',
    'comedy',
    (select id from public.venues where slug = 'manchester-arena'),
    '2026-08-22 20:00:00+00',
    45.00, 65.00,
    'on_sale', true,
    'Britain''s best-loved comedian returns to the stage with all new material.'
  ),
  (
    'Arctic Monkeys',
    'arctic-monkeys-glasgow-2026',
    'concert',
    (select id from public.venues where slug = 'sse-hydro'),
    '2026-09-05 19:00:00+00',
    55.00, 85.00,
    'upcoming', false,
    'Sheffield''s finest bring their electrifying live show to Glasgow.'
  ),
  (
    'Peppa Pig''s Fun Day Out',
    'peppa-pig-fun-day-out-birmingham-2026',
    'family',
    (select id from public.venues where slug = 'birmingham-hippodrome'),
    '2026-05-30 11:00:00+00',
    18.00, 35.00,
    'on_sale', true,
    'Join Peppa, George and all their friends in this brand new live adventure!'
  ),
  (
    'Premier League All-Stars',
    'pl-all-stars-london-2026',
    'sports',
    (select id from public.venues where slug = 'wembley-stadium'),
    '2026-06-20 15:00:00+00',
    30.00, 120.00,
    'upcoming', false,
    'Watch the Premier League''s biggest stars in an unmissable charity match.'
  );

-- Link Coldplay to their event
insert into public.event_artists (event_id, artist_id, is_headliner, "order")
  select e.id, a.id, true, 1
  from public.events e, public.artists a
  where e.slug = 'coldplay-music-of-the-spheres-2026'
    and a.slug = 'coldplay';

insert into public.event_artists (event_id, artist_id, is_headliner, "order")
  select e.id, a.id, true, 1
  from public.events e, public.artists a
  where e.slug = 'arctic-monkeys-glasgow-2026'
    and a.slug = 'arctic-monkeys';
