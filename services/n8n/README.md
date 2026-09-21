# n8n (self-hosted, local dev)

1. `cp .env.example .env` and set a basic-auth password (leave the API keys
   blank until you have real credentials — workflows must handle missing
   keys by returning an "unavailable" result, never fake data).
2. `docker compose up -d`
3. Open http://localhost:5678 and log in with the credentials from `.env`.
4. Workflows are exported to `workflows/*.json` as they're built (Phase 2+)
   so they're versioned alongside the app, not only stored inside n8n.

No Orchestrator exists yet — this folder started as scaffolding only
(Phase 0).

## Weather Agent (Phase 3)

| Workflow | ID | Role |
|---|---|---|
| `Weather - Core` | `KmugUDlkzrUu0lBw` | Calls Open-Meteo, maps to `WeatherSnapshot`. Exported as `weather-core.json`. |
| `Weather API` | `HWWa4cQLD1CscuPj` | Public `POST /webhook/weather`. Verifies the Supabase JWT, then calls Core. Exported as `weather-api.json`. |
| `My workflow 2` | `vHf5eRZPtpHHmV1K` | MCP Server Trigger exposing the `get_weather` tool. Exported as `weather-mcp-tool.json`. |
| `Weather MCP Bridge` | `TxK28e058YeKu32L` | `GET /webhook/weather-mcp`, the unauthenticated hop `get_weather` calls. Exported as `weather-mcp-bridge.json`. |

```
Webhook → Verify Supabase Token → Authenticated? ─ no ──→ Respond 401
                                        │ yes
                                        ▼
                              Call 'Weather - Core'
                                        │
Core Trigger → Fetch Open-Meteo → API Failed? ─ true ──→ Build Unavailable Result
   (lat, long, locale)   │              └ false ───────→ Map Weather Result
                         └─ error output ─────────────→ Build Unavailable Result
```

**Coordinates come from the request, never from the workflow.** The
frontend sends the farm's own `farms.latitude/longitude`; a farm without
a location is never sent to the agent at all (the page shows an empty
state instead). The workflow this replaced had `13.0827, 80.2707`
hardcoded, so every farm got Chennai's weather.

Source: Open-Meteo — no API key, which is why it was chosen over
OpenWeatherMap. `OPENWEATHERMAP_API_KEY` in `.env.example` stays unused.
Requested fields are current conditions plus a 3-day daily forecast, with
`timezone=auto` so readings are in the farm's local time.

`Map Weather Result` passes every number through exactly as Open-Meteo
reported it; a value the source omitted becomes `null`, never a
substituted default. Conditions stay as **numeric WMO codes** so the
frontend can render them through i18n — a Tamil, Telugu or Hindi farmer
reads the condition in their own language instead of English pasted in
from n8n.

Advisory flags (`rain_expected_today`, `heavy_rain_expected`,
`thunderstorm_expected`, `high_wind`, `extreme_heat`,
`no_rain_next_3_days`) are threshold-derived statements of what the
forecast says. They are **not** recommendations, and no treatment or
chemical guidance is produced anywhere in this workflow. Thresholds live
at the top of the `Map Weather Result` code node.

Nothing is persisted — weather is read live on each view, so there is no
Supabase table and no migration behind this feature.

### `get_weather` (MCP)

```
MCP client → get_weather (httpRequestTool)
           → GET /webhook/weather-mcp   (Weather MCP Bridge, no auth)
           → Weather - Core → Open-Meteo
```

The tool is an **HTTP Request Tool**, not a Call n8n Workflow Tool. That
matters: `httpRequestTool` derives its schema from the `$fromAI` calls in
its query parameters, so an MCP client sees separate `latitude` and
`longitude` parameters. `toolWorkflow` exposes only a single `input`
string and never receives structured coordinates — it was tried first and
returned "no data for this location" for every call, whatever the caller
passed.

Two defects in the original are fixed here: the workflow behind the tool
ignored the coordinates it was given (Chennai was hardcoded), and the
second parameter was mis-named `"=longitude"` so longitude never arrived
under the right key.

**Why the bridge exists and why it is unauthenticated.** `get_weather`
cannot call `/webhook/weather`, which requires a Supabase JWT an MCP
client has no way to obtain. The bridge is a deliberately narrow
alternative: three nodes, whose only capability is forwarding
`latitude`/`longitude`/`locale` to `Weather - Core` and returning the
result. It holds no credentials, reads no Supabase table, and cannot
reach Crop Diagnosis. What it exposes is public Open-Meteo data for
arbitrary coordinates from a free, keyless API — nothing billable and no
farm data — which is why leaving it open is an acceptable trade where
doing the same for `/webhook/crop-diagnosis` would not be. The
farmer-facing `/webhook/weather` and `/webhook/crop-diagnosis` both stay
JWT-protected and are unaffected.

## Market Agent (Phase 4)

| Workflow | ID | Role |
|---|---|---|
| `Market - Core` | `9Yyz0Lawme5tXIYT` | Resolves the district, queries AGMARKNET, maps to `MarketSnapshot`. Exported as `market-core.json`. |
| `Market API` | `GeUoAx2HqiBqXKJv` | Public `POST /webhook/market`. Verifies the Supabase JWT, then calls Core. Exported as `market-api.json`. |

```
Webhook → Verify Supabase Token → Authenticated? ─ no ──→ Respond 401
                                        │ yes
                                        ▼
                               Call 'Market - Core'

Core Trigger → Resolve Location → Resolved? ─ false ──→ Build Unresolved Result
 (state, district,                    │ true
  commodity, locale)                  ▼
                            Fetch AGMARKNET → API Failed? ─ true ──→ Build Unavailable Result
                                    │               └ false ───────→ Map Market Result
                                    └─ error output ───────────────→ Build Unavailable Result
```

Source: AGMARKNET's daily mandi-price resource via data.gov.in
(`9ef84268-d588-465a-a308-a864a43d0070`). The free data.gov.in key is the
n8n Credential `oHR7Vr7vQQqNhwXR` ("Query Auth account", HTTP Query
Auth) — `DATA_GOV_IN_API_KEY` in `.env.example` stays unused, and the key
is never in this repo.

**District and crop come from the request, never from the workflow.** The
frontend sends the farm's own `farms.state`/`farms.district` plus the
selected `farm_crops.cropName`; a farm without a saved district is never
sent to the agent at all (the page shows an empty state instead).

### Refreshing `DISTRICT_MAP`

`Resolve Location` holds AGMARKNET's own district values — 284 districts
across 21 states, captured from a full snapshot, not hand-written. It
lists the districts that *reported arrivals* in that snapshot, so it goes
stale as AGMARKNET's coverage changes. To refresh: page the resource with
no `filters[...]`, collect the distinct `state` + `district` pairs, and
replace the literal in the code node. Leave the matching rule alone (see
below) and re-run the collision check — the rule is only safe because it
currently resolves all 284 districts with zero ambiguity.

The rule: lowercase → letters only → drop `h` → drop vowels → collapse
doubled consonants, matched **within the resolved state**. Indic
transliteration varies almost entirely in vowels and aspirates, so the
consonant skeleton is the stable part (`thiruvallur` and `Thiruvellore`
both reduce to `trvlr`). This is exact resolution of one district under a
different spelling, **not** fuzzy matching: a skeleton matching zero
districts — or more than one — resolves to nothing and the caller gets
`unavailable` naming the text that failed, so the farmer can correct
their farm record. Guessing a neighbouring district would quote a
different market's prices as if they were this farmer's.

### Result mapping

`Map Market Result` passes every price through exactly as AGMARKNET
reported it; a field the source omitted becomes `null`, **never 0** — a
zero-rupee price would read as "free". `arrival_date` is `DD/MM/YYYY`,
parsed explicitly rather than handed to `Date()`, and returned as ISO
`reportedOn`. Rows with no market name are dropped (they cannot be told
apart in the UI); rows with an unreadable date are kept and sorted last,
because the price is still real.

A **200 with an empty `records` array** is how this API reports "nothing
matched", so the count is checked explicitly — otherwise a normal "no
arrivals today" would surface as a successful empty price table.

Every reporting mandi is returned, not a single "best" price: a farmer
compares mandis, and picking one for them would hide the spread. There is
no history to return — the resource is a daily snapshot — which is why
the UI shows no trend charts.

Nothing is persisted: prices are read live on each view, so there is no
Supabase table and no migration behind this feature.

### Verified against the live instance

Negative cases (2026-09-21), all returning HTTP 401
`{"status":"unavailable","reason":"Authentication required."}`: no
`Authorization` header, an invalid JWT, and the publishable anon key used
as a user token. `Market - Core` recorded **zero** executions across all
three — its latest execution id (192) predates the first rejection (193),
confirming the false branch terminates before Core.

## Orchestrator and Decision Agent (Phase 6)

| Workflow | ID | Role |
|---|---|---|
| `Orchestrator API` | `rclCnv6rxWemQpeF` | Public `POST /webhook/orchestrator`. Verifies the Supabase JWT, then calls Core. Exported as `orchestrator-api.json`. |
| `Orchestrator - Core` | `ydzxQDVZWs1NkB9y` | Fans out to Weather, Market and Schemes, collects the signals. Exported as `orchestrator-core.json`. |
| `Decision - Core` | `A66udhtC979OlmrB` | Applies the rule table, builds the briefing. Exported as `decision-core.json`. |

```
Webhook → Verify Supabase Token → Authenticated? ─ no ──→ Respond 401
                                        │ yes
                                        ▼
                            Call 'Orchestrator - Core'

Core Trigger → Build Agent Inputs
                  ├─ Weather Ready? ─true→ Call 'Weather - Core' ─┐
                  │                 └false→ Skip Weather ─────────┤
                  ├─ Market Ready?  ─true→ Call 'Market - Core' ──┤→ Join Signals
                  │                 └false→ Skip Market ──────────┤   (append, 3)
                  └─ Call 'Schemes - Core' ────────────────────────┘
                                                                   ▼
                                    Collect Signals → Call 'Decision - Core'

Decision Trigger → Parse Signals → Signals Usable? ─false→ Build Unavailable Result
                                        │ true
                                        └→ Apply Rules → Build Briefing
```

### Three node choices that are easy to break by "simplifying"

- **Join Signals is a synchronisation join, not a data path.**
  `Collect Signals` reads each branch by node name (`$('Call Weather -
  Core')`) inside try/catch, so signal identity never depends on merge
  ordering or item counts. A branch that never executed throws, is
  caught, and becomes a `skipped` signal carrying the reason its gate
  computed.
- **Readiness gates exist only where the call is guaranteed useless.**
  Calling Weather with no coordinates would burn a round trip to learn
  what the farm record already said, and would report "the weather
  service failed" when the truth is "this farm has no location saved" —
  a difference the farmer can act on.
- **Every `Call … - Core` has `onError: continueRegularOutput`**, so one
  dead agent produces a partial briefing rather than a 500.

**Fan-out is failure isolation, not concurrency.** n8n walks branches one
after another under `executionOrder: v1`; the win is a single round trip
and independent failure. Measured 1.5–4.7s end to end.

### Why the briefing cannot give agronomic advice

`Apply Rules` is an explicit table — no LLM, no prose, no cross-agent
causal rules, nothing historical. Each rule emits only
`{ key, params, priority, sourceAgent }`; the wording lives in the locale
bundles.

Two of the exclusions are structural rather than merely forbidden,
because of what the frontend sends:

- `latestSoil` is `{ testedOn }` only. NPK and pH never leave the
  browser, so no rule can read soil chemistry into guidance.
- `recentScans` carries no disease label. The rules can restate that the
  Crop Diagnosis Agent asked for an expert, and nothing more.

Edit the readable sources under `services/n8n/workflows/src/decision/`
and `src/orchestrator/`, then push, republish, re-export, and run
`node scripts/verify-decision-rules.mjs` — it proves the exported
`jsCode` is byte-identical to those files, checks every emitted action
key has a label in all four languages, and audits those labels for
chemical names and treatment verbs.

### Verified against the live instance

Negative cases (2026-09-21), all HTTP 401
`{"status":"unavailable","reason":"Authentication required."}`: no
`Authorization` header, an invalid JWT, and the publishable anon key used
as a user token — with **zero** `Orchestrator - Core` executions.
Authenticated runs confirmed: full context; no coordinates (weather
`skipped: noCoordinates`, others still run); no district (market
`skipped: noDistrict`); no crops (market `skipped: noCrop`); crop
switched; and no soil or scans.

## Government Schemes Agent (Phase 5)

| Workflow | ID | Role |
|---|---|---|
| `Schemes - Core` | `f6lVtDQSTI6CAok5` | Curated catalog, state scoping, criteria evaluation. Exported as `schemes-core.json`. |
| `Schemes API` | `mfk9O1NprWnLOf5v` | Public `POST /webhook/schemes`. Verifies the Supabase JWT, then calls Core. Exported as `schemes-api.json`. |
| `Schemes Catalog Check` | `b1WFRhp8rFm0r7UK` | Weekly source-URL and staleness check. Reports only. Exported as `schemes-catalog-check.json`. |

```
Webhook → Verify Supabase Token → Authenticated? ─ no ──→ Respond 401
                                        │ yes
                                        ▼
                               Call 'Schemes - Core'

Core Trigger → Load Catalog → Catalog Usable? ─ false ──→ Build Unavailable Result
 (state, district,                   │ true
  areaAcres, crops, locale)          ▼
                          Filter By State → Evaluate Criteria → Build Match Result
```

### Editing the catalog

The catalog is a versioned constant inside `Load Catalog`. **Edit the
readable sources**, not the workflow JSON:

```
services/n8n/workflows/src/schemes/
  catalog-literal.js              the catalog itself
  node-load-catalog.js            input normalisation
  node-filter-by-state.js         central vs state scoping
  node-evaluate-criteria.js       criteria + grouping
  node-build-match-result.js      DataResult wrapper
  node-build-unavailable-result.js
  node-collect-report.js          the checker's report
```

Then push them into n8n, re-publish, re-export, and run
`node scripts/verify-scheme-catalog.mjs`, which proves the exported
workflow's `jsCode` is byte-identical to these files and enforces the
catalog rules (official `https` source, a `lastVerifiedOn` date, at least
one `manual` criterion per scheme, and an English label for every
criterion key). Reviewing a catalog change inside a one-line escaped
string is not reviewing it — that is what these files are for.

**Rules, repeated here because they are the whole point:** never invent a
scheme, benefit or amount; if a figure is not on the official page,
describe the benefit qualitatively and link out. Never generate entries
with an LLM. Only bump `lastVerifiedOn` after actually re-reading the
source.

### Why it cannot say "you are eligible"

Every entry carries at least one criterion of kind `manual` — something
only the farmer or the issuing office can confirm. Those always evaluate
to `cannot_check`, and `Evaluate Criteria` **drops** any scheme whose
criteria contain none, so a card with nothing left to verify can never
render. The frontend normalizer enforces the same rule independently, in
case either side regresses.

What we can check is thin: state, district, `area_acres` and recorded
crops. Land ownership vs tenancy, total holding across all land, social
category, income-tax status, Aadhaar/bank linkage and notified-area
status are all unavailable — see `docs/architecture.md` "Phase 5".

### The checker distinguishes blocked from dead

Several government hosts answer a browser but refuse n8n Cloud — 403 from
`dac.gov.in`, silent timeouts from `tn.gov.in`, a TLS reset from
`karnataka.gov.in`. The first run reported 7 of 10 entries dead while
every one returned 200 from a normal client minutes earlier. So results
are split four ways — `reachable`, `blocked` (server answered and refused
us), `missing` (404/410), `unreachable` (no response) — and only
`missing` plus staleness are flagged as work for a person. A checker that
cries wolf weekly gets ignored, which is worse than not having one.

## Crop Diagnosis Agent (Phase 2)

Live in n8n Cloud as two workflows:

| Workflow | ID | Role |
|---|---|---|
| `Crop Diagnosis - Core` | `AOURgRfTVM9bsGzV` | The logic. Exported here as `crop-diagnosis-core.json`. |
| `Crop Diagnosis API` | `FPR9ZKAIO6ql9E8v` | Public `POST /webhook/crop-diagnosis`. Verifies the caller's Supabase JWT, then calls Core and responds. Exported as `crop-diagnosis-api.json`. |

The frontend calls the API workflow through
`callAgentWebhook("crop-diagnosis", …)` with `{ imageUrl, cropName, locale }`,
where `imageUrl` is a 120-second Supabase signed URL. Core never touches
Supabase — the frontend persists the `scans` row itself (see
`docs/architecture.md`), so n8n holds no Storage or DB credential for
this feature.

### Authentication

`/webhook/crop-diagnosis` is a public URL, so the API workflow verifies the
caller before doing any work:

```
Webhook → Verify Supabase Token → Authenticated? ─ no ──→ Respond 401
                                        │ yes
                                        └────────────────→ Call Core → Respond
```

`Verify Supabase Token` does `GET {SUPABASE_URL}/auth/v1/user`, sending the
**publishable anon key** as `apikey` plus the caller's `Authorization`
header forwarded verbatim. Supabase checks the signature, expiry and
whether the session is still valid, so n8n needs no service-role key and
no JWT signing secret. A missing header sends no token and Supabase
returns 401, so one check covers both missing and invalid credentials.

The rejection happens *before* `Call Core`, so an unauthenticated request
never reaches Roboflow. `neverError` is on so a 401/403 stays on the
node's normal output for the IF to route, rather than failing the run.

The frontend already forwards the token — `callAgentWebhook()` in
`apps/web/src/lib/n8nClient.ts` attaches `Authorization: Bearer
<supabase access_token>` on every call.

Note this authenticates *a* signed-in user, not ownership of a specific
farm: the payload is `{imageUrl, cropName, locale}` with no `farmId`.

In the exported JSON the anon key is replaced with `SET_IN_N8N_UI`. It is
a publishable key (it ships in the frontend bundle), but it is kept out
of the repo for consistency with how `.env` is handled.

### Core pipeline

```
Core Trigger → Download Image → Roboflow Detect → API Failed?
                                                  ├─ true  → Build Unavailable Result
                                                  └─ false → Map Diagnosis Result

Download Image (error output) ───────────────────────────→ Build Unavailable Result
```

Model: **`crop-disease-axhjj/1`** (Roboflow 3.0 Object Detection, 9
classes, tomato-focused). Coverage is narrow — this is a **prototype**,
not a guaranteed agricultural diagnosis. `Map Diagnosis Result` returns
`category: "inconclusive"` rather than a forced label whenever the top
prediction is below 0.4, two different classes are within 0.15 of each
other, or the response is unusable. No treatment or prevention text is
ever generated: `visualEvidence` and `careGuidance` stay empty.

Two node choices are deliberate and easy to break by "simplifying":

- **The image is passed to Roboflow by URL**, via the `image` query
  parameter, and Roboflow fetches it itself. There is no request body.
  An earlier version uploaded the bytes instead (resize → base64 →
  binary), but once the `image` parameter was added Roboflow used the URL
  and ignored the upload — execution logs showed it analysing the
  original full-size image while the uploaded copy was capped at 1024px.
  Those three nodes were removed as dead work.
  - Consequence: Roboflow must be able to reach the URL. Supabase signed
    URLs work (query string and all). Some hosts that block automated
    fetchers — Wikimedia is one — return
    `"Data pointed by URL could not be decoded into image"`, which
    surfaces as a normal `status: "unavailable"`. Worth knowing when
    testing with arbitrary internet images rather than real uploads.
- **Download Image has `onError: continueErrorOutput`** wired to
  `Build Unavailable Result`, so an unreachable image URL produces a
  `status: "unavailable"` payload instead of an HTTP 500. It stays in the
  flow as a reachability check even though Roboflow fetches the image
  itself.

### Credentials

Auth is the n8n Credential `09Kxolhl0Ov6DIjM` ("Header Auth account",
HTTP Header Auth) attached to `Roboflow Detect`.

⚠️ The live node **also** carries a hardcoded ` api_key` query parameter
holding a real Roboflow key — n8n's own validator flags this as
`HARDCODED_CREDENTIALS`. The exported JSON in this repo has that value
replaced with `SET_IN_N8N_CREDENTIAL`; **never commit the real key**. It
should be rotated in Roboflow and moved into the n8n credential
(`genericAuthType: httpQueryAuth`), after which the query parameter can
be deleted.

### Publishing (important)

n8n 2.x separates a workflow's **draft** from its **published** version.
Manual runs in the editor execute the draft; the production webhook
executes the published version. A Core edit that is saved but not
published passes in the editor and still fails in production — that
exact divergence made the live API run a stale workflow. After editing
Core, publish it (`publish_workflow`, or Publish in the UI).

### n8n Cloud management API

n8n 2.x exposes an instance-level MCP server at
`https://<instance>.app.n8n.cloud/mcp-server/http` (Settings → MCP) with
~54 workflow-management tools (`search_workflows`, `get_workflow_details`,
`update_workflow`, …). It needs an `Authorization: Bearer <access token>`
header. This is **not** the same as an MCP Server Trigger workflow URL
(`/mcp/<uuid>`), which only publishes your own workflows as callable
tools and cannot manage n8n. The access token is a secret: keep it in
your local Claude/MCP client config, never in this repo.
