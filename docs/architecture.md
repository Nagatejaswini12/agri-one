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

## Phase 3 — Weather Agent

- **Provider**: Open-Meteo, no API key. Current conditions plus a 3-day
  daily forecast, requested with `timezone=auto` so readings are in the
  farm's local time.
- **Coordinates are the farm's own.** `useWeather(farm)` sends
  `farms.latitude/longitude` (captured by `FarmForm`'s "use current
  location"). A farm with no saved location never reaches the agent —
  the page shows an `EmptyState` linking to Farm detail, because
  substituting any other coordinate would mean presenting a different
  place's weather as this farm's. The prototype workflow this replaced
  had Chennai hardcoded and returned it for every farm.
- **n8n**: `Weather - Core` (`KmugUDlkzrUu0lBw`) calls Open-Meteo and
  maps the response; `Weather API` (`HWWa4cQLD1CscuPj`) is the
  `POST /webhook/weather` path, verifying the farmer's Supabase JWT
  before Core runs — so an unauthenticated request never reaches
  Open-Meteo. Both exported under `services/n8n/workflows/`. The
  `get_weather` MCP tool reaches Core through a separate, deliberately
  minimal `Weather MCP Bridge` webhook — an MCP client cannot obtain a
  Supabase JWT, and that bridge can do nothing but forward coordinates
  for public weather. See `services/n8n/README.md` for why it is left
  unauthenticated and why the same would not be acceptable for Crop
  Diagnosis.
- **WMO codes, not text.** The agent returns numeric weather codes and
  stable advisory keys; the frontend maps both through i18n. This keeps
  conditions readable in Tamil/Telugu/Hindi instead of English arriving
  from n8n — the gap the Crop Diagnosis disclaimer still has.
- **Advisory flags are descriptive, not prescriptive.** Six
  threshold-derived flags state what the forecast shows (heavy rain,
  thunderstorms, high wind, extreme heat, a dry spell). They carry no
  treatment or chemical guidance, consistent with "Content rules" above,
  and the UI labels them as forecast descriptions rather than advice.
- **Missing values stay missing.** Any reading the source omitted is
  `null` end to end and renders as a dash — never a substituted default.
  `modules/weather/normalize.ts` enforces this at the boundary, the same
  defensive pattern as `modules/scan-crop/normalize.ts`.
- **No persistence, no migration.** Weather is read live on each view;
  there is no `weather` table and nothing is written to Supabase.

## Phase 4 — Market Agent

- **Provider**: AGMARKNET's daily mandi-price resource via data.gov.in
  (`9ef84268-d588-465a-a308-a864a43d0070`). The free data.gov.in key is
  an n8n Credential (HTTP Query Auth), never in `.env` or this repo.
- **District is the farm's own.** `useMarket(farm, commodity)` sends
  `farms.state`/`farms.district` plus the `farm_crops.cropName` the
  farmer picked. A farm with no saved district never reaches the agent —
  the page shows an `EmptyState` linking to Farm detail, for the same
  reason the Weather Agent refuses to guess coordinates: another
  district's prices are a different market, not an approximation of this
  one.
- **Spelling is resolved, never guessed.** `Resolve Location` maps the
  farmer's free text onto AGMARKNET's own district values (284 districts
  across 21 states, captured from a full snapshot rather than
  hand-written) using a consonant-skeleton match — Indic transliteration
  varies almost entirely in vowels and aspirates, so `Thiruvallur` and
  `Thiruvellore` reduce alike. It is exact resolution under a different
  spelling, **not** fuzzy matching: a skeleton matching zero districts,
  or more than one, resolves to nothing and the farmer is told which
  district text failed, so they can fix the farm record. Matching is
  scoped within the resolved state, so text can never resolve into a
  different state. Refresh the map when AGMARKNET's district list changes
  — see `services/n8n/README.md`.
- **n8n**: `Market - Core` (`9Yyz0Lawme5tXIYT`) resolves the location,
  queries AGMARKNET and maps the response; `Market API`
  (`GeUoAx2HqiBqXKJv`) is the `POST /webhook/market` path, verifying the
  farmer's Supabase JWT before Core runs. The `Authenticated?` false
  branch terminates at `Respond Unauthorized` with no onward connection,
  so an unauthenticated request cannot reach AGMARKNET — verified
  against the live instance: three rejected calls produced three
  `Market API` executions and zero `Market - Core` executions. Both
  exported under `services/n8n/workflows/`.
- **Current snapshot only.** The source publishes one snapshot per day
  with no history behind it, so there is nothing to chart — which is
  also what "Content rules" above already required of this module.
- **The source's date is the headline.** `reportedOn` per quote and
  `latestReportedOn` across them are AGMARKNET's own arrival dates
  (`DD/MM/YYYY`, converted to ISO). The UI leads with that date and shows
  `asOf` — when the request ran — separately, because "checked just now"
  and "priced yesterday" are different facts and conflating them would
  overstate how current the price is.
- **Every mandi is shown.** A farmer compares mandis; returning a single
  "best" price would hide the spread that makes the comparison worth
  anything.
- **Missing values stay missing.** A price the source omitted is `null`
  end to end and renders as a dash — never 0, which would read as "sold
  for nothing". A 200 with zero records is how this API says "nothing
  matched", so it is checked explicitly and surfaced as unavailable
  rather than as an empty table.
  `modules/market/normalize.ts` enforces all of this at the boundary
  (14 unit tests, `npm run test -w @agri-one/web`), the same defensive
  pattern as the Weather and Crop Diagnosis normalizers.
- **Verified end to end against the live source.**
  `scripts/market-e2e.mjs` signs in as a local test farmer, calls the real
  `POST /webhook/market`, and runs the live responses through the very
  normalizer the UI uses — so it proves the live contract rather than a
  fixture of it. It needs a gitignored `.test-account.json`
  (`{ email, password }`) and prints no credentials.
- **No persistence, no migration.** Prices are read live on each view;
  there is no `market` table and nothing is written to Supabase.

## Hosting (Phase 8)

- Frontend → Netlify.
- n8n + Supabase are hosted separately from the frontend deployment.

See the project report (`AGRI_ONE_Plan_and_Action_Items.pdf`) for module
descriptions, the full agent responsibility table, and the honesty rules
this architecture is built to satisfy.
