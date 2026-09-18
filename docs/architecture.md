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

## Hosting (Phase 8)

- Frontend → Netlify.
- n8n + Supabase are hosted separately from the frontend deployment.

See the project report (`AGRI_ONE_Plan_and_Action_Items.pdf`) for module
descriptions, the full agent responsibility table, and the honesty rules
this architecture is built to satisfy.
