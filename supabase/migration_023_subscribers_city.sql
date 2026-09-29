-- Adds an optional city tag to subscribers so city-page newsletter signups
-- ("Get Derby event alerts") can be targeted, while the generic homepage
-- signup keeps working unchanged (city stays null there).
alter table public.subscribers add column if not exists city text;
create index if not exists subscribers_city_idx on public.subscribers (city) where city is not null;
