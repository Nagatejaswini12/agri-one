-- AGRI ONE — Phase 1 core schema: farmer profiles, farms, farm crops,
-- soil records. Every table is owned by exactly one farmer (directly, or
-- via the farm it belongs to) and RLS enforces that a farmer can only
-- ever see/change their own rows. No seed/demo data is inserted by this
-- migration — every row is created by real app usage.

-- ---------------------------------------------------------------------
-- farmers: one row per Supabase auth user, id shared with auth.users.id
-- ---------------------------------------------------------------------
create table public.farmers (
  id uuid primary key references auth.users (id) on delete cascade,
  name text,
  email text,
  phone text,
  preferred_language text not null default 'en'
    check (preferred_language in ('en', 'ta', 'te', 'hi')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.farmers enable row level security;

create policy "farmers_select_own" on public.farmers
  for select using (id = auth.uid());

create policy "farmers_update_own" on public.farmers
  for update using (id = auth.uid()) with check (id = auth.uid());

-- Defensive: normally rows are created by the handle_new_user trigger
-- below (which runs as the trigger owner and bypasses RLS), but allow a
-- farmer to insert their own row directly too.
create policy "farmers_insert_own" on public.farmers
  for insert with check (id = auth.uid());

-- ---------------------------------------------------------------------
-- farms: a farmer's plots. Location/area are nullable — a farmer may not
-- have entered them yet, and the app must show that honestly rather than
-- inventing values.
-- ---------------------------------------------------------------------
create table public.farms (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid not null references public.farmers (id) on delete cascade,
  name text not null,
  latitude double precision,
  longitude double precision,
  state text,
  district text,
  area_acres numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index farms_farmer_id_idx on public.farms (farmer_id);

alter table public.farms enable row level security;

create policy "farms_owner_all" on public.farms
  for all using (farmer_id = auth.uid()) with check (farmer_id = auth.uid());

-- ---------------------------------------------------------------------
-- farm_crops: crop context for a farm (report: "crop information,
-- calendar and crop stage"). Farmer-entered only.
-- ---------------------------------------------------------------------
create table public.farm_crops (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms (id) on delete cascade,
  crop_name text not null,
  variety text,
  sowing_date date,
  current_stage text,
  status text not null default 'active'
    check (status in ('active', 'harvested', 'abandoned')),
  created_at timestamptz not null default now()
);

create index farm_crops_farm_id_idx on public.farm_crops (farm_id);

alter table public.farm_crops enable row level security;

create policy "farm_crops_owner_all" on public.farm_crops
  for all
  using (farm_id in (select id from public.farms where farmer_id = auth.uid()))
  with check (farm_id in (select id from public.farms where farmer_id = auth.uid()));

-- ---------------------------------------------------------------------
-- soil_records: farmer-provided soil values (manual entry or a future
-- Soil Health Card upload). Never populated by anything other than the
-- farmer — no invented NPK/pH.
-- ---------------------------------------------------------------------
create table public.soil_records (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms (id) on delete cascade,
  source text not null default 'manual' check (source in ('manual', 'shc_upload')),
  soil_type text,
  nitrogen numeric,
  phosphorus numeric,
  potassium numeric,
  ph numeric check (ph is null or (ph >= 0 and ph <= 14)),
  organic_carbon numeric,
  tested_on date,
  document_url text,
  created_at timestamptz not null default now()
);

create index soil_records_farm_id_idx on public.soil_records (farm_id);

alter table public.soil_records enable row level security;

create policy "soil_records_owner_all" on public.soil_records
  for all
  using (farm_id in (select id from public.farms where farmer_id = auth.uid()))
  with check (farm_id in (select id from public.farms where farmer_id = auth.uid()));

-- ---------------------------------------------------------------------
-- Keep updated_at current on farmers/farms.
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger farmers_set_updated_at
  before update on public.farmers
  for each row execute function public.set_updated_at();

create trigger farms_set_updated_at
  before update on public.farms
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Auto-create a farmers row when a new auth user signs up, seeded from
-- the email and the preferred_language passed as signUp() metadata (see
-- apps/web/src/auth/AuthProvider.tsx). SECURITY DEFINER so it can write
-- to public.farmers despite the new user having no session yet.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.farmers (id, email, preferred_language)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'preferred_language', 'en')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
