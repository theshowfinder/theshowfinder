-- Adds a 'local' event category for manually-curated local events (markets,
-- art fairs, community events) that don't come through the Ticketmaster
-- sync — added so Claude/Chris can add these weekly via the new
-- /admin/events/new form.
ALTER TYPE event_category ADD VALUE IF NOT EXISTS 'local';
