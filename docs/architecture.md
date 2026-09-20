# Architecture

AGRI ONE follows PLAN → GROW → PROTECT → SELL across 12 modules (Home
Dashboard, My Farms, Scan Crop, Weather & Advisory, Soil & Water, Pest
Alerts, Market Analysis, Marketplace/Buyers, Government Schemes, Reports,
Scan History, Voice AI), reference: `AGRI_ONE_Plan_and_Action_Items.pdf`.

## Layers

- **`apps/web`** — React + Vite + TypeScript PWA, mobile-first. This is a
  two-tier architecture: the frontend talks **directly** to Supabase
  (auth, farm/crop/soil/scan/report data, protected by row-level
  security) and **directly** to n8n webhooks (AI/agent orchestration) —
  there is no custom backend service in between. This matches the
  project report's technical architecture exactly.
  - `lib/supabaseClient.ts` — the Supabase client (`null` until
    `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` are set).
  - `lib/n8nClient.ts` — `callAgentWebhook()` posts to an n8n webhook and
    forwards the farmer's Supabase JWT as the bearer token; the
    Orchestrator workflow verifies it. A missing session, missing config,
    or failed request all normalize to the same `DataResult` "unavailable"
    shape, so callers render one consistent state either way.
  - State: TanStack Query for server data, Zustand for session/language/
    active-farm. i18n via `react-i18next`, one locale JSON per language
    under `public/locales/<code>/common.json` — adding a language means
    adding a folder, no code changes.
  - Navigation mirrors the report's journey: Home + four stage tabs
    (Plan → Farms, Soil & Water · Grow → Weather & Advisory · Protect →
    Scan Crop, Pest Alerts · Sell → Market Analysis, Marketplace), a
    "More" link for Schemes/Reports/Scan History, and a floating mic
    button for Voice AI reachable from anywhere.
- **`services/n8n`** — self-hosted via Docker Compose
  (`docker-compose.yml`). Hosts the Orchestrator Agent and specialized
  agent workflows (Crop Diagnosis, Weather, Soil, Pest, Market,
  Government Scheme, Decision, Language/Voice). Workflow JSON is exported
  to `workflows/` so it's versioned with the app. All external data-source
  API keys live only in this service's `.env` — never in the frontend.
- **`packages/shared-types`** — TypeScript types shared by `apps/web` and
  the n8n workflow payload contracts, mirroring the Supabase schema.
  Includes `DataResult<T>`, the contract every live-data endpoint must
  return: either `{ status: "ok", asOf, source, data }` or
  `{ status: "unavailable", reason }` — never a fabricated default.

## Data flow (typical request)

1. Frontend reads/writes farm context directly against Supabase
   (row-level security scopes every query to the signed-in farmer).
2. For an AI/agent request (question, voice, image), the frontend calls
   the n8n Orchestrator webhook directly via `callAgentWebhook()`,
   forwarding the farmer's Supabase JWT.
3. Orchestrator verifies the JWT, loads farm/crop context from Supabase,
   classifies intent, and fans out to the relevant specialized agent
   workflow(s) in parallel where possible.
4. Agents call their real external data source; on failure they return
   `{ status: "unavailable", reason }`, not placeholder data.
5. Decision Agent fuses signals into a prioritized action checklist when
   an action recommendation applies, and populates `Advisory.disclaimer`
   whenever the guidance is chemical/agricultural (see "Content rules"
   below).
6. Orchestrator translates the final payload into the farmer's selected
   language and returns it; the frontend persists the interaction to
   Supabase (feeds Reports / Scan History) and renders it.

## Content rules

- Chemical/agricultural advice (fertilizer, pesticide, dosage, etc.) must
  carry a source/confirmation note in `Advisory.disclaimer` stating it is
  general guidance, not a substitute for a qualified agronomist.
- The Crop Diagnosis Agent's `CropDiagnosisResult.primaryFinding.confidence`
  is the vision model's own reported probability, not a calibrated
  real-world certainty — every UI surface must present it as "the
  model's estimated likelihood," never as accuracy. The contract has no
  pesticide/chemical field anywhere; when evidence is insufficient the
  result must be `category: "inconclusive"` with `recommendExpertConsult:
  true` rather than a forced diagnosis.
- Reports are built only from the farmer's own entered data:
  `FarmFinancialRecord` (cost/revenue entries) and `YieldRecord` (harvest
  quantities) — never derived, estimated, or pre-filled values.
- Market Analysis shows a current/latest snapshot only; no historical
  trend charts while the no-historical-data requirement stands.

## Build order

Per the report's step-by-step plan, later phases build and test each n8n
agent workflow (Weather → Crop Diagnosis → Soil → Market → Government
Scheme → Decision) backend-first — directly against real inputs — before
wiring up its full frontend screen, then add the multilingual/voice
layer, then do end-to-end integration and testing, then deploy. Farms/
Auth scaffolding comes first regardless, since every agent needs real
farm context to run against.

## Phase 1 — auth, profile, farms, soil

- **Auth**: `apps/web/src/auth/AuthProvider.tsx` wraps the app and exposes
  `useAuth()` (`status`: `loading` | `unconfigured` | `signed-out` |
  `signed-in`, plus `signInWithPassword`/`signUpWithPassword`/`signOut`).
  `RequireAuth` guards the entire `AppShell` route tree — `/sign-in` and
  `/sign-up` are the only public routes. `unconfigured` (no Supabase env
  vars) and `loading` render an honest full-page message rather than a
  broken app.
- **Schema**: `supabase/migrations/20260919120000_phase1_core_schema.sql`
  creates `farmers`, `farms`, `farm_crops`, `soil_records`. A
  `handle_new_user` trigger on `auth.users` auto-creates each farmer's
  `farmers` row (seeded with the `preferred_language` passed as sign-up
  metadata) — the client never inserts it directly. See `supabase/README.md`
  for how to apply it and the manual dashboard steps required.
- **RLS**: every table is owned by exactly one farmer, directly
  (`farmers`, `farms`) or via the farm it belongs to (`farm_crops`,
  `soil_records`). No cross-farmer reads are possible.
- **Frontend data access**: `apps/web/src/lib/mappers.ts` converts
  Supabase's snake_case rows to the camelCase `shared-types` shapes. Each
  feature has its own `hooks.ts` (`modules/profile`, `modules/farms`,
  `modules/soil-water`) using TanStack Query directly against `supabase`
  — no repository/service layer beyond that.
- **Language**: `useAppStore` persists the active language (and active
  farm selection) to `localStorage` as a per-device convenience.
  `useFarmerProfile` + `useSyncLanguageFromProfile` pull the source of
  truth (`farmers.preferred_language`) once signed in; `LanguageSwitcher`
  writes back to it on every change while signed in.
- **Empty vs. unavailable**: `EmptyState` (farmer hasn't entered this yet
  — nothing is wrong) is now distinct from `DataUnavailable` (a live
  external source failed or isn't configured, used starting Phase 2).

## Phase 2 — Crop Diagnosis Agent

- **Provider**: Roboflow's Serverless Hosted API, model
  `crop-disease-axhjj/1` (Roboflow 3.0 Object Detection, 9 classes,
  tomato-focused). Originally built against Kindwise's Crop Health API;
  switched to Roboflow when the Kindwise account had no available credits
  and no key, without any fake/mocked diagnosis data at any point.
  **Prototype scope**: the model's class coverage is narrow — this is
  not comprehensive crop coverage, and its output is a model estimate,
  not a guaranteed agricultural diagnosis.
- **n8n**: two live workflows. `Crop Diagnosis - Core`
  (`AOURgRfTVM9bsGzV`, exported to
  `services/n8n/workflows/crop-diagnosis-core.json`) downloads the image,
  resizes it, base64-encodes it, calls Roboflow, and maps the response
  into `CropDiagnosisResult` (`packages/shared-types`) — chosen over a
  general-purpose multimodal LLM so confidence scores are real classifier
  probabilities, not fluent-sounding guesses. `Crop Diagnosis API`
  (`FPR9ZKAIO6ql9E8v`) is the `POST /webhook/crop-diagnosis` path the
  frontend calls via `callAgentWebhook()`; it takes
  `{ imageUrl, cropName, locale }` and delegates to Core. See
  `services/n8n/README.md` for the node-by-node layout, why the
  resize/base64 steps are load-bearing, the credential setup, and the
  draft-vs-published gotcha that silently runs stale logic in production.
- **Mapping rules**: any empty, low-confidence, ambiguous (two top
  predictions within 0.15 of each other), or malformed/unsupported
  prediction becomes `category: "inconclusive"` with
  `recommendExpertConsult: true` — never a forced label. Roboflow reports
  only a class name + its own confidence score, with no reference images
  and no prevention/treatment text of any kind (chemical or otherwise) —
  `visualEvidence` and `careGuidance` are therefore left as empty arrays
  rather than invented, pending a possible future curated non-chemical
  guidance lookup (not built yet).
- **Unlike other agents, this workflow never writes to Supabase.** The
  frontend uploads the photo to the private `crop-scans` Storage bucket,
  creates its own short-lived signed URL, calls the webhook, and on an
  `"ok"` result persists the `scans` row itself — the same
  frontend-persists pattern described in "Data flow" step 6, just made
  explicit here since n8n holds no Storage/DB credential for this
  feature at all (only the Roboflow credential plus the anon key needed
  to verify the farmer's JWT).
- **Schema**: `supabase/migrations/20260919140000_phase2_scans.sql` adds
  `scans` (farm-scoped RLS, same pattern as `soil_records`) and the
  `crop-scans` bucket (private, object RLS scoped to `auth.uid()`).
- **Frontend**: `apps/web/src/modules/scan-crop` — farm/crop selection,
  photo capture/upload, and a result view that visually separates the
  model's reported confidence from certainty (bucketed high/medium/low
  with copy stating it's a model score) and shows an expert-consult
  banner whenever the agent recommends one; the evidence-images and
  care-guidance sections simply don't render while those arrays are
  empty. `normalize.ts` sits between the webhook and the UI: the agent
  runs in n8n, outside this repo's type checking, so a workflow edit can
  change its payload without the frontend knowing. It coerces whatever
  arrives into `CropDiagnosisResult` — absent arrays become empty, an
  unusable finding becomes `unavailable`, confidence is clamped to 0–1 —
  so a contract drift degrades to an honest state instead of crashing
  the page. It never fills in content the agent didn't send.

## Hosting (Phase 8)

- Frontend → Netlify.
- n8n + Supabase are hosted separately from the frontend deployment.

See the project report (`AGRI_ONE_Plan_and_Action_Items.pdf`) for module
descriptions, the full agent responsibility table, and the honesty rules
this architecture is built to satisfy.
