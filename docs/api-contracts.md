# API Contracts

There is no custom backend — the frontend talks directly to Supabase and
directly to n8n webhooks (see `docs/architecture.md`). This file tracks
those two contract surfaces as they're built.

## Conventions

- Every n8n agent webhook responds with the `DataResult<T>` shape from
  `packages/shared-types`:
  ```ts
  { status: "ok", asOf: string, source: string, data: T }
  | { status: "unavailable", reason: string }
  ```
- Every webhook call carries `Authorization: Bearer <supabase-jwt>`
  (see `apps/web/src/lib/n8nClient.ts`); the workflow verifies it before
  touching any farm-specific data or calling an external provider.
- Supabase access is scoped by row-level security policies keyed to
  `auth.uid()` — every table a farmer can read/write must have a policy
  restricting rows to their own `farmer_id` (directly, or via the
  farm/crop they own).

## Currently implemented

### `POST /webhook/crop-diagnosis`

Request `{ imageUrl, cropName, locale }`, where `imageUrl` is a
short-lived Supabase signed URL. Responds with
`DataResult<CropDiagnosisResult>`.

Unauthenticated calls return HTTP 401 and never reach the vision model.
The result carries no pesticide or chemical field; insufficient evidence
returns `category: "inconclusive"` rather than a forced label.

### `POST /webhook/weather`

Request `{ latitude, longitude, locale }` — the farm's own coordinates,
read from `farms.latitude/longitude`. Responds with
`DataResult<WeatherSnapshot>`.

Unauthenticated calls return HTTP 401 and never reach Open-Meteo. A farm
with no saved location is never sent at all: the page shows an empty
state, because substituting any other coordinate would mean showing a
different place's weather as if it were this farm's.

Two contract details worth stating explicitly:

- Conditions are returned as **numeric WMO codes**, not text, so the
  frontend renders them through i18n in the farmer's own language.
- `advisories` is a list of stable threshold-derived keys describing what
  the forecast says (for example `heavy_rain_expected`). They are
  descriptions, never recommendations, and carry no treatment or chemical
  guidance.

Nothing from this endpoint is persisted — weather is read live per view.

### `POST /webhook/market`

Request `{ state, district, commodity, locale }` — the farm's own saved
`farms.state`/`farms.district` plus the `farm_crops.cropName` the farmer
selected. Responds with `DataResult<MarketSnapshot>`.

Unauthenticated calls return HTTP 401 and never reach AGMARKNET: the
workflow's `Authenticated?` false branch terminates at
`Respond Unauthorized`, which has no onward connection to
`Market - Core`.

Contract details worth stating explicitly:

- **Current snapshot only.** The AGMARKNET resource behind this is a
  daily snapshot with no history to page through, so there is no trend
  data to return and the UI shows no charts.
- **Every reporting mandi is returned**, not a single "best" price — a
  farmer compares mandis, and picking one for them would hide the
  spread.
- `reportedOn` (per quote) and `latestReportedOn` (the newest across
  them) are the source's own arrival dates, converted from `DD/MM/YYYY`
  to `YYYY-MM-DD`. They answer "how current is this?" and are separate
  from `asOf`, which is only when this request ran.
- **A price the source omitted is `null`, never `0`** — a zero-rupee
  price would read as "this crop sold for nothing". The UI renders a
  `null` as a dash.
- The returned `state`/`district` are AGMARKNET's own spellings, resolved
  from what the farmer saved (`Thiruvallur` → `Thiruvellore`). Resolution
  is exact-or-nothing: text matching zero districts, or more than one,
  returns `unavailable` naming what was searched for, rather than
  guessing a neighbouring district.
- A 200 with zero records is how this API reports "nothing matched", so
  it is checked explicitly and returned as `unavailable`, not as an empty
  price table.

Nothing from this endpoint is persisted — prices are read live per view.

## Planned, in build order

1. `POST /webhook/soil` — Soil Agent
2. `POST /webhook/schemes` — Government Scheme Agent
3. `POST /webhook/orchestrator` — Orchestrator (fronts Decision Agent +
   Language/Voice Service once the above are individually proven)
