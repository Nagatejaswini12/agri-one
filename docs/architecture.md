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
2. Each feature page calls **its own** agent webhook via
   `callAgentWebhook()`, forwarding the farmer's Supabase JWT. The
   Orchestrator is one more such endpoint — the Home Dashboard's farm
   briefing — not a gateway every page routes through. A page that needs
   one agent calls one agent.
3. Every webhook verifies the JWT before doing any work. **n8n reads no
   Supabase table**: the frontend sends the farm context it already
   holds, so no workflow carries a database credential — only the
   publishable anon key used to verify the token.
4. Agents call their real external data source; on failure they return
   `{ status: "unavailable", reason }`, not placeholder data.
5. The Orchestrator fans out to Weather, Market and Schemes on
   independent branches and hands the collected signals to
   `Decision - Core`, which applies an explicit rule table. It combines
   and prioritises facts; it does not synthesise new ones, and it emits
   no prose (see "Phase 6").
6. **Language is resolved in the frontend, not in n8n.** Agents return
   stable keys — WMO codes, advisory flags, criterion keys, action keys
   — and `react-i18next` renders them. Every agent accepts a `locale`
   for future use, but none branches on it. This keeps four languages of
   agricultural wording in reviewable locale files instead of behind a
   workflow boundary.

Earlier drafts of this document described a single Orchestrator that
every request passed through, which loaded farm context from Supabase and
translated the response. The build went the other way on all three
points, deliberately: per-page agents keep each feature independently
testable, keeping Supabase out of n8n keeps its blast radius small, and
translating in the frontend keeps the wording reviewable.

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

## Phase 5 — Government Schemes Agent

- **No API exists, and that shaped the design.** myScheme's own endpoint
  (`api.myscheme.gov.in/search/v4/schemes`) answers 401 to anything
  outside its portal; using it would mean impersonating their frontend.
  data.gov.in publishes scheme budget and beneficiary tables, not
  eligibility rules. API Setu is org-onboarded identity APIs. So the
  catalog is **human-curated**, held as a versioned constant inside
  `Schemes - Core`, with the readable node sources under
  `services/n8n/workflows/src/schemes/` — reviewing a catalog change
  inside an escaped one-line string is not reviewing it.
  `scripts/verify-scheme-catalog.mjs` proves those sources are what n8n
  actually runs.
- **The module cannot tell a farmer they are eligible, by
  construction.** Every entry carries at least one `manual` criterion —
  something only the farmer or the issuing office can confirm (land
  records, income-tax status, an enrolment window) — which always
  evaluates to `cannot_check`, and `Evaluate Criteria` drops any scheme
  that has none. So every card shows both what matched and what the
  farmer must still verify. This is not caution for its own sake: a
  false "you qualify" sends a farmer on a wasted trip, and a false "you
  don't" costs them a benefit they were entitled to.
- **What we can and cannot check.** Available: state, district,
  `area_acres`, recorded crops. Structurally missing, and each blocking a
  real criterion: land ownership vs tenancy, *total* holding across all
  land (so small/marginal status can't be derived from one farm), social
  category, gender, age, income and income-tax status, Aadhaar and bank
  linkage, existing enrolments, and whether the farm sits in a notified
  area. That gap is why this is discovery routed to the official source,
  not an assessment.
- **n8n**: `Schemes - Core` (`f6lVtDQSTI6CAok5`) loads the catalog,
  scopes it by state, evaluates criteria and returns the result;
  `Schemes API` (`mfk9O1NprWnLOf5v`) is the `POST /webhook/schemes` path,
  verifying the farmer's Supabase JWT before Core runs — verified
  against the live instance: three rejected calls produced three
  `Schemes API` executions and zero `Schemes - Core` executions.
  `Schemes Catalog Check` (`b1WFRhp8rFm0r7UK`) re-tests every source URL
  weekly. All three exported under `services/n8n/workflows/`.
- **The checker reports; it never rewrites.** Scraping a scheme's
  benefit text would replace a fact a person vouched for with a guess.
  It also distinguishes a *blocked* fetch from a *dead* link: several
  government hosts (dac.gov.in, tn.gov.in, karnataka.gov.in) answer a
  browser but refuse n8n Cloud with a 403, a reset or a silent timeout.
  Its first run called 7 of 10 entries dead while every one returned 200
  from a normal client minutes earlier, so `blocked` / `unreachable` /
  `missing` are now separate and only `missing` and staleness are
  treated as work for a person.
- **State scoping is exact-or-nothing.** Central schemes apply
  everywhere; a state scheme needs the farm's free-text state resolved to
  a canonical name first (`tamilnadu` → `Tamil Nadu`). A farm with no
  usable state is not told "no state schemes apply" — it gets
  `stateSchemesSkipped`, and the page says how many could not be
  considered.
- **Criteria travel as keys, not prose**, so they render in Tamil,
  Telugu and Hindi. Scheme names, purposes and benefits keep the official
  source's wording: translating an entitlement ourselves would risk
  changing what it promises.
- **No persistence, no migration.** A read-only discovery list; there is
  no `schemes` table, no bookmarks and no application tracking.

## Phase 6 — Orchestrator and Decision Agent

- **What it is**: the Home Dashboard's farm briefing. One call that asks
  Weather, Market and Schemes about the active farm, adds what the
  farmer's own soil and scan records say, and returns a prioritised,
  fully-attributed list. There is no separate Orchestrator route and no
  other page routes through it.
- **It combines facts; it does not synthesise them.** Every line comes
  from one entry in an explicit rule table (`Apply Rules`), carrying
  `{ key, params, priority, sourceAgent }`. No LLM is involved anywhere.
  The wording lives in the locale bundles, written once per language and
  reviewable by a person — which is also what makes it impossible for a
  chemical name, dosage or treatment instruction to reach a farmer.
- **Two exclusions are structural, not just forbidden.** The frontend
  sends `latestSoil` as `{ testedOn }` only — NPK and pH never leave the
  browser — and `recentScans` without the disease label. So "advise from
  soil chemistry" and "turn a diagnosis into a treatment" are things the
  rules *cannot* do, rather than things they are asked not to. Widening
  either projection is a deliberate contract change.
- **No cross-agent causal rules.** Stating that rain is forecast *and*
  that prices were reported invites a "sell before the rain" reading
  that neither signal supports. Considered and left out.
- **Partial results are the normal case.** Each agent sits on its own
  branch with `onError: continueRegularOutput`, and `signals` always
  carries an entry for all six sources including the ones that failed or
  were skipped. `skipped` is distinct from `unavailable`: "no location
  saved" is something the farmer can fix, "the weather service failed"
  is not.
- **One crop, named.** Market is per-commodity, so the briefing prices
  exactly one crop, shows which, and offers a selector when the farm has
  several — rather than implying it covers everything grown.
- **n8n**: `Orchestrator API` (`rclCnv6rxWemQpeF`) verifies the JWT;
  `Orchestrator - Core` (`ydzxQDVZWs1NkB9y`) fans out and collects;
  `Decision - Core` (`A66udhtC979OlmrB`) applies the rules. Cores are
  called directly — the JWT is verified once at the edge, so there is no
  second HTTP hop. Verified live: three rejected calls produced three
  `Orchestrator API` executions and zero `Orchestrator - Core` ones.
- **Fan-out is about failure isolation, not concurrency.** n8n walks
  branches one after another under `executionOrder: v1`, so the win is
  one round trip and independent failure, not wall-clock parallelism.
  Measured 1.5–4.7s end to end. The briefing card loads independently so
  the rest of the Dashboard renders immediately.
- **The rule table is reviewed as source.** `Apply Rules` is versioned
  readably under `services/n8n/workflows/src/decision/`, and
  `scripts/verify-decision-rules.mjs` proves it is what n8n runs, checks
  every emitted key has a label in all four languages, and audits those
  labels for chemical names and treatment verbs.
- **No persistence, no migration.** The briefing is recomputed per view.
  Checklist state is not stored; `Advisory`/`ActionItem` remain
  unbacked types and should be revisited when Reports is built.

## Phase 7 — Multilingual chat and voice assistant

- **What it is**: the `/voice-ai` page, reached from the floating mic.
  The farmer types or speaks a question in English, Tamil, Telugu or
  Hindi and gets an answer in that same language, as text and — where
  the device has a voice — read aloud.
- **It is not a general agricultural advice bot.** Nine intents, a
  closed enum, each answered by the one agent that owns it: Weather,
  Market and Schemes Cores, the Orchestrator for a briefing summary, and
  the frontend-supplied context for scans, soil and farm details.
- **No LLM, and none needed.** Routing is deterministic multilingual
  keyword matching against a table versioned in the repo. The worst a
  misclassification can do is answer the wrong *true* question. An LLM
  classifier could sit ahead of `Classify Intent`, emitting the same
  `{intent, cropSlot}` shape with this as its fallback — but it would
  never be allowed to write an answer.
- **There is no free-text answer path at all.** `Chat - Core` emits
  `answerKey` + `params`; `renderAnswer` composes the sentence from the
  locale bundles. That is the same "keys not prose" discipline as the
  Decision Agent, and it is what makes a chemical name, a dosage or a
  treatment instruction impossible to produce in four languages at once.
- **Soil values are reported, not interpreted.** The projection carries
  the farmer's recorded `soilType`, `ph`, NPK and `organicCarbon`, so
  `soil.status` can read them back as facts using the same labels the
  Soil & Water page uses. No rule compares a reading to a threshold —
  that comparison is precisely where a report would become a
  prescription. Fields the farmer left blank are simply not listed.
- **The scan projection carries no disease label**, so the assistant can
  restate that the Crop Diagnosis Agent recommended an expert, and
  nothing more. There is no route from `Chat - Core` to the diagnosis
  workflow, so chat can never trigger an inference.
- **Voice is a progressive enhancement, structurally.** The
  `SpeechProvider` interface (`lib/speech/`) is implemented in v1 by the
  browser's Web Speech API — no key, no cost, nothing to fail
  server-side. The mic button renders only when a recognition engine
  exists; a missing voice for the active language produces a visible
  notice rather than silence; text chat never depends on either. A
  hosted Indic provider (Bhashini, Sarvam) would be a second
  implementation of the same interface with no UI change.
- **Spoken and written answers cannot diverge**: `renderAnswer` produces
  one string, which is both displayed and handed to `speechSynthesis`.
- **Language follows the app.** `useAppStore.language` maps to `en-IN`,
  `ta-IN`, `te-IN`, `hi-IN`; the assistant holds no preference of its
  own.
- **n8n**: `Chat API` (`8yH5ATGCbdmRmhE4`) verifies the JWT;
  `Chat - Core` (`tlmAbOaRU2ILqRil`) classifies and routes. Verified
  live: three rejected calls produced zero `Chat - Core` executions, and
  all nine intents answer correctly in all four languages.
- **No persistence, no migration.** Chat history is session-only React
  state.
- `scripts/verify-chat-answers.mjs` proves the readable node sources are
  what n8n runs, that every emitted `answerKey` has a label in all four
  languages, and audits those labels for products, doses and eligibility
  claims.

## Phase 8 — Reports

- **Entirely the farmer's own data.** Two tables,
  `farm_financial_records` and `yield_records`, both farmer-entered.
  No external source, no API key, no agent and no n8n workflow — the
  same shape as Soil & Water, which is also pure Supabase.
- **No entries means no numbers.** An empty ledger renders an empty
  state, never ₹0. A farmer who has recorded nothing has not earned
  nothing; the app simply does not know, and a zero would be a
  fabricated value dressed as a fact. `summarizeFinancials` returns
  `hasEntries: false` and the page gates the whole summary on it.
- **Nothing is derived beyond arithmetic on entered values.**
  `margin` is exactly recorded income minus recorded expenses. There is
  no estimation, no projection, and no filling of gaps — the rule
  "Reports are built only from the farmer's own entered data" in
  "Content rules" is enforced in `summarize.ts` and asserted in tests.
- **Yields are never summed across units.** Adding quintals to bags
  would invent a number that means nothing, so totals stay grouped by
  the unit the farmer chose. Converting between them would need a
  crop-specific weight this app does not have.
- **Two deliberate delete behaviours.** A financial entry's `crop_id`
  is nullable with `ON DELETE SET NULL`: deleting a crop must never
  erase money actually spent. A yield's `crop_id` is required with
  `ON DELETE CASCADE`, because a harvest quantity with no crop means
  nothing.
- **Categories and units are stable keys**, not display text, held in
  `modules/reports/constants.ts` and rendered through
  `reports.category.*` / `reports.unitName.*`. "Fertiliser" there
  labels money the farmer spent, the way a receipt does — nothing in
  this module recommends buying or applying anything.
- **Migration**: `supabase/migrations/20260923120000_phase8_reports.sql`
  adds both tables with farm-scoped RLS matching `soil_records`, plus
  the base table `GRANT` to `authenticated` — without which RLS
  policies are never evaluated and every request fails with 42501 (see
  `20260919130000_grant_authenticated_role.sql`).

## Phase 9 — Marketplace ("Where you can sell") and the variety-scoped price fix

- **No new agent, no new workflow, no migration.** Marketplace calls
  `Market - Core` — the same webhook the Market Analysis page already
  uses, with the same request shape. The only new code is frontend:
  grouping, classification and copy. A second workflow returning the
  same AGMARKNET snapshot would be duplication, not a feature.
- **Mandis are not buyers, and the page says so twice.** AGMARKNET
  publishes which market yards *reported a price*, not who will buy a
  farmer's produce. The page opens with "These are mandis that reported
  a price today, not buyers" and closes with "AGRI ONE holds no trader
  contacts and does not arrange sales." There are no names, no phone
  numbers and no contact details anywhere in the module, because there
  is no verified open dataset of agricultural buyers in India (see
  `docs/data-sources.md`) and inventing one would be the single most
  harmful thing this app could do.
- **Venue type is read from the source's own naming, never guessed.**
  `classifyVenue` matches `Uzhavar Sandhai` → farmers' market and
  `APMC` → regulated market yard; everything else is labelled plainly
  as a market. The classifier reads the mandi name AGMARKNET returned
  and nothing else — no lookup table of what a mandi "probably" is.
- **Official channels appear only for a state that has a verified
  entry.** `OFFICIAL_CHANNELS` mirrors the curated scheme catalog by
  `catalogId`, and tests assert the URL, source name and
  `lastVerifiedOn` cannot drift from it. A state with no verified
  channel gets nothing — not a national placeholder, which would point
  a farmer at a scheme that may not serve them. Links are
  `rel="noopener noreferrer"` to official `.gov.in` addresses.

### The cross-variety price bug this phase fixed

AGMARKNET reports several varieties of one commodity under the same
commodity name, and **their prices are not comparable**. Madurai on
2026-09-24 reported Onion (Bellary) at ₹4,500 and Onion (Green) at
₹8,700; Pune reported Onion (Local) at ₹2,850 and Onion (Other) at
₹10 — in the same mandi, on the same day. Comparing across those
varieties produces a spread that is arithmetically real and
agriculturally meaningless, and acting on it would send a farmer to the
wrong market.

- `groupComparableQuotes(quotes)` groups on **variety + grade**
  together, and a group must hold **at least two** venues with a valid
  modal price before any comparison is made.
- `Decision - Core` now emits `marketPriceReportedVariety` and
  `marketSpreadVariety`, naming the variety in the line the farmer
  reads, and finds the widest spread *within* a group rather than
  across the district.
- `Chat - Core` carries the identical correction: `market.price`
  scopes to one variety group and emits `marketPriceVariety`, with
  `count` reporting the mandis for *that variety*, not the commodity.
- The two copies of `groupComparableQuotes` are asserted
  byte-identical in `modules/market/spread.test.ts`, which loads the
  function out of both shipped node sources rather than from a
  re-implementation — a drift between them would be invisible
  otherwise.
- `Market - Core` was deliberately **not** changed: it reports what the
  source published, variety and grade included. The grouping belongs to
  whoever compares, not to the workflow that fetches.

## Phase 10 — Pest Activity, and the category the agent could not emit

- **No workflow, no migration, no API, no credential.** The page reads
  the `scans` rows the farmer already has, through the same RLS-scoped
  `useScans` query Scan History uses, and filters them in the frontend.
  Filtering client-side is safe here precisely because Supabase already
  scoped the rows server-side; the filter is presentation, not
  authorisation.
- **It reports sightings, never risk.** Every line is something that
  happened: a photo the farmer took, on a date, that the model
  classified as a pest. There is no risk score, no severity, no
  forecast, and **no weather input anywhere in the module** — deriving
  "you probably have pests" from rainfall would be inventing a fact
  about someone's field.
- **The two empty states are deliberately different.** "You have not
  scanned anything here" and "your scans found no pest activity" mean
  very different things, and the second one says so out loud: *"That
  does not mean your farm is free of pests — only that the photos you
  scanned did not show any."* Absence of evidence in a farmer's photos
  is not evidence of absence in their field, and collapsing the two
  would read as a clean bill of health nobody issued.
- **The uncertainty wording is borrowed, not rewritten.** The page
  renders `scanCrop.confidenceLevel.*`, `scanCrop.modelEstimate` and
  `scanCrop.notCalibratedNote` — the same strings the Crop Diagnosis
  result screen uses — and passes the model's confidence through
  untouched. Re-bucketing or rounding it would turn the model's own
  score into a new claim made by this module.
- **No chemical, dose or treatment, in any language.** For what to do
  about a pest, the page sends the farmer to the officials whose job
  that is. The curated directory links portal *homes*, never a deep link
  into a page of chemical recommendations: where an official body
  publishes that guidance, the farmer reaches it on that body's own
  site, under that body's own name, which is where the decision belongs.
- **National resources are allowed here, unlike Marketplace's selling
  channels.** A national plant-protection authority genuinely serves
  every state; a state's market does not. State entries still render
  only in their own state.

### The bug this phase found: `pest` was unreachable

`DiagnosisCategory` has declared `"disease" | "pest" | "healthy" |
"inconclusive"` since Phase 2, and `normalize.ts` has always accepted
all four — but `Map Diagnosis Result` could only ever produce three. Its
label router tested `/healthy/`, then a disease pattern, then fell
through to `inconclusive`, and **`spider mites` was a literal term inside
the disease pattern**. The model's one genuine arthropod class was filed
as a pathogen, and a page filtering on `category === "pest"` would have
been empty forever while telling farmers "no pest activity found".

- `categoriseLabel(label)` is now a single named function used by both
  the primary finding and the alternatives list. Those were two separate
  copies of the same regexes before, which is how they could drift.
- **Order is load-bearing.** The class is
  `Tomato two spotted spider mites leaf`, which contains "spotted" — the
  disease pattern's `/spot/` claims it if disease is tested first. Pest
  is therefore tested before disease, and a test asserts exactly that.
- **Separators are normalised first.** The same class appears as
  `Tomato___Spider_mites_Two-spotted_spider_mite` in other exports, and
  `_` is a word character, so `\bmites\b` silently failed and the label
  fell through to "spotted" → disease. Both spellings now classify
  identically, and a test pins the pair together.
- Roboflow inference, the model, and every other classification path are
  unchanged, and **no stored row was rewritten**: historical scans keep
  the category they were written with, and only new scans use the
  corrected routing.
- `scripts/verify-diagnosis-categories.mjs` proves the classifier is
  identical in the authored source, the exported JSON and the live
  workflow, and that all four declared categories are reachable. This
  check exists because the gap it guards went unnoticed for three
  phases.

### What this page cannot do, and why

The classifier's only arthropod class is the two-spotted spider mite, so
Pest Activity can surface that pest and nothing else. It is **not
general pest detection**, and the model is weak on it in practice:
seventeen real spider-mite photographs — from PlantVillage, PlantDoc and
Wikimedia Commons, run through the live flow — were classified as
mosaic virus, early blight, yellow virus or inconclusive, and not once
as mites. The fix is verified by tests against the shipped classifier
rather than by a captured pest scan, because no real photo available
would produce one, and manufacturing a `scans` row to make the screen
look populated would be exactly the fabrication this module exists to
avoid.

## Hosting (Phase 8)

- Frontend → Netlify.
- n8n + Supabase are hosted separately from the frontend deployment.

See the project report (`AGRI_ONE_Plan_and_Action_Items.pdf`) for module
descriptions, the full agent responsibility table, and the honesty rules
this architecture is built to satisfy.
