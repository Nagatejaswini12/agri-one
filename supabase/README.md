# Supabase setup (Phase 1)

No Supabase project is wired up in this environment — these are manual
steps to run against your own project.

## 1. Apply the migrations, in order

1. `migrations/20260919120000_phase1_core_schema.sql` creates `farmers`,
   `farms`, `farm_crops`, `soil_records`, their indexes, RLS policies, and
   the trigger that auto-creates a `farmers` row on sign-up. It inserts no
   data — every row after this migration is created by real app usage.
2. `migrations/20260919130000_grant_authenticated_role.sql` — **required**,
   grants the `authenticated` role table-level access. RLS policies alone
   don't make a table queryable; Postgres also needs a base `GRANT`, which
   the first migration didn't include. Without this, every request fails
   with `permission denied for table ...` (42501) even though RLS would
   have allowed it. Discovered via read-only verification before the first
   real sign-up — see `docs/architecture.md`.
3. `migrations/20260919140000_phase2_scans.sql` — Phase 2: creates
   `scans` (Crop Diagnosis Agent results) and a private `crop-scans`
   Storage bucket with object-level RLS (each farmer can only
   read/write objects under their own `auth.uid()` path prefix). The
   frontend uploads directly to this bucket and creates its own
   short-lived signed URLs — n8n never holds a Storage credential for
   this feature.

Either:

- **Dashboard**: open your project's SQL Editor and run each file's
  contents once, in order, or
- **CLI**: `supabase link --project-ref <your-project-ref>` then
  `supabase db push` (requires the Supabase CLI and Docker).

## 2. Auth provider settings (Dashboard → Authentication)

- Email/password sign-in is enabled by default — Phase 1 uses it as-is.
- **Confirm email**: with confirmation *on* (default), a new farmer must
  click the emailed link before `signUp()` returns a session — the app
  shows "check your email" in that case. For local development without
  email delivery configured, you can turn this off under Authentication →
  Providers → Email → "Confirm email", but re-enable it before any real
  farmer signs up.
- **Site URL / Redirect URLs**: set to `http://localhost:5173` for local
  dev, and add your Netlify URL once deployed (Phase 8), or confirmation
  links will point at the wrong host.

## 3. Environment variables

Copy `.env.example` → `apps/web/.env` and fill in:

```
VITE_SUPABASE_URL=<Project Settings → API → Project URL>
VITE_SUPABASE_ANON_KEY=<Project Settings → API → anon public key>
```

Only the **anon** key ever goes in frontend code — it's safe to expose
(it's what RLS is for). Never put the service-role key in `apps/web`.

## 4. Verify

After applying the migration and setting the env vars, sign up a real
account from the app's `/sign-up` page and confirm a row appears in
`public.farmers` with a matching `id`.
