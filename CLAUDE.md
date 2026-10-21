IMPORTANT: Never change git config. Always commit as user "theshowfinder" with email "chris.spence73@gmail.com". Never use co-authored-by or any other author.

@AGENTS.md

## Database migrations (Supabase)

Migrations live in `supabase/migration_NNN_<name>.sql` and are applied by hand to the live project. From 30 Oct 2026 Supabase no longer auto-grants API access to new tables in `public`, so every migration that creates a table, view or materialized view must grant it in the same file:

```sql
grant select, insert, update, delete on public.<name> to service_role;   -- always (server code, crons, admin)
-- Only if the public site reads it directly with the anon key:
grant select on public.<name> to anon, authenticated;
```

Server-only tables (state, logs, admin) get the service_role grant only, plus RLS enabled. `npm test` (src/lib/migrationGrants.test.ts) fails if a migration from 079 onwards is missing the service_role grant.

