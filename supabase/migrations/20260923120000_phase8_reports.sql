-- ---------------------------------------------------------------------
-- Phase 8 — Reports.
--
-- Two farmer-entry tables backing the Reports module. Everything here is
-- typed by the farmer: nothing is derived, estimated or pre-filled, and
-- there is no external source behind either table (see
-- docs/architecture.md "Content rules").
--
-- Both follow the soil_records pattern exactly: farm-scoped ownership,
-- row-level security keyed to the owning farm, and — critically — a base
-- table GRANT. Enabling RLS is not enough on its own: Postgres requires
-- the table-level privilege before policies are even evaluated, and
-- skipping it is what produced the 42501 "permission denied" failures
-- fixed by 20260919130000_grant_authenticated_role.sql.
-- ---------------------------------------------------------------------

-- Cost and revenue entries. `crop_id` is nullable because a farmer can
-- record a farm-level expense (a pump repair, a land tax) that belongs
-- to no single crop.
create table public.farm_financial_records (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms (id) on delete cascade,
  -- ON DELETE SET NULL, not CASCADE: deleting a crop must never erase
  -- money the farmer actually spent or earned. The entry survives and
  -- simply stops being attributed to that crop.
  crop_id uuid references public.farm_crops (id) on delete set null,
  type text not null check (type in ('cost', 'revenue')),
  -- A stable key (seed, fertilizer, labour, sale, …), not display text —
  -- the UI renders it through reports.category.* so it reads in the
  -- farmer's own language.
  category text not null,
  -- Sign is carried by `type`, so the amount itself is never negative.
  amount numeric not null check (amount >= 0),
  quantity numeric check (quantity is null or quantity >= 0),
  unit text,
  recorded_on date not null,
  notes text,
  created_at timestamptz not null default now()
);

-- Harvest quantities.
create table public.yield_records (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms (id) on delete cascade,
  -- Required, and CASCADE on delete: a harvest quantity with no crop
  -- attached means nothing, unlike a financial entry.
  crop_id uuid not null references public.farm_crops (id) on delete cascade,
  quantity numeric not null check (quantity >= 0),
  -- Units are never converted or assumed, so the unit the farmer chose
  -- is stored with the quantity and totals are grouped by it.
  unit text not null,
  harvested_on date not null,
  created_at timestamptz not null default now()
);

create index farm_financial_records_farm_id_idx on public.farm_financial_records (farm_id);
create index farm_financial_records_crop_id_idx on public.farm_financial_records (crop_id);
create index yield_records_farm_id_idx on public.yield_records (farm_id);
create index yield_records_crop_id_idx on public.yield_records (crop_id);

-- ---------------------------------------------------------------------
-- Row-level security: a row belongs to whoever owns its farm. Same shape
-- as soil_records_owner_all. No cross-farmer read is possible.
-- ---------------------------------------------------------------------
alter table public.farm_financial_records enable row level security;

create policy "farm_financial_records_owner_all" on public.farm_financial_records
  for all
  using (farm_id in (select id from public.farms where farmer_id = auth.uid()))
  with check (farm_id in (select id from public.farms where farmer_id = auth.uid()));

alter table public.yield_records enable row level security;

create policy "yield_records_owner_all" on public.yield_records
  for all
  using (farm_id in (select id from public.farms where farmer_id = auth.uid()))
  with check (farm_id in (select id from public.farms where farmer_id = auth.uid()));

-- Required alongside RLS — see 20260919130000_grant_authenticated_role.sql.
-- Only `authenticated`: nothing in this app reads or writes farmer data
-- without a signed-in session, so `anon` is granted nothing.
grant select, insert, update, delete on public.farm_financial_records to authenticated;
grant select, insert, update, delete on public.yield_records to authenticated;
