-- AGRI ONE — Phase 2: Crop Diagnosis Agent storage. Adds the `scans`
-- table (farmer-owned, RLS-scoped via the farm it belongs to, same
-- pattern as soil_records) and a private `crop-scans` Storage bucket for
-- the uploaded leaf/crop photos. No diagnosis is ever written here by
-- this migration — every row is created by a real scan + a real n8n
-- Crop Diagnosis Agent response.

-- ---------------------------------------------------------------------
-- scans: one row per crop-photo diagnosis. diagnosis_result mirrors the
-- CropDiagnosisResult shape in packages/shared-types — stored as jsonb
-- since Postgres has no matching structured type, but the frontend and
-- n8n workflow both write/read it by that exact contract.
-- ---------------------------------------------------------------------
create table public.scans (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms (id) on delete cascade,
  crop_id uuid not null references public.farm_crops (id) on delete cascade,
  image_url text not null,
  diagnosis_result jsonb,
  confidence numeric,
  created_at timestamptz not null default now()
);

create index scans_farm_id_idx on public.scans (farm_id);
create index scans_crop_id_idx on public.scans (crop_id);

alter table public.scans enable row level security;

create policy "scans_owner_all" on public.scans
  for all
  using (farm_id in (select id from public.farms where farmer_id = auth.uid()))
  with check (farm_id in (select id from public.farms where farmer_id = auth.uid()));

-- Required alongside RLS — see 20260919130000_grant_authenticated_role.sql
-- for why the base GRANT is needed in addition to the policy above.
grant select, insert, update, delete on public.scans to authenticated;

-- ---------------------------------------------------------------------
-- crop-scans Storage bucket: private (not public), one object per scan
-- at path "{farmerId}/{farmId}/{scanId}.jpg". The frontend uploads and
-- later creates its own short-lived signed URL directly with the
-- farmer's session — n8n never holds a Storage key for this feature.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('crop-scans', 'crop-scans', false)
on conflict (id) do nothing;

create policy "crop_scans_owner_insert" on storage.objects
  for insert
  with check (
    bucket_id = 'crop-scans'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "crop_scans_owner_select" on storage.objects
  for select
  using (
    bucket_id = 'crop-scans'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "crop_scans_owner_delete" on storage.objects
  for delete
  using (
    bucket_id = 'crop-scans'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
