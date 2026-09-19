-- Fixes a gap in 20260919120000_phase1_core_schema.sql: enabling RLS and
-- adding policies is not enough on its own — Postgres also requires a
-- base table-level GRANT before RLS policies are even evaluated. This
-- project's default privileges didn't cover the new tables, so every
-- request (even ones RLS would allow) was rejected with
-- "permission denied for table ..." (42501) before RLS ran at all.
--
-- Only the `authenticated` role is granted: nothing in this app ever
-- reads/writes farmer data without a signed-in session, so `anon` gets
-- nothing here (RLS would reduce it to zero rows anyway, but there's no
-- reason to grant it).
grant select, insert, update, delete on public.farmers to authenticated;
grant select, insert, update, delete on public.farms to authenticated;
grant select, insert, update, delete on public.farm_crops to authenticated;
grant select, insert, update, delete on public.soil_records to authenticated;
