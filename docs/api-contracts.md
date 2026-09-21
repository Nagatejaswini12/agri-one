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

### `POST /webhook/schemes`

Request `{ state, district, areaAcres, crops, locale }` — the farm's own
`farms.state`/`district`/`area_acres` plus the `farm_crops.cropName`
values. Responds with `DataResult<SchemeMatchResult>`.

Unauthenticated calls return HTTP 401 and never reach `Schemes - Core`:
the `Authenticated?` false branch terminates at `Respond Unauthorized`
with no onward connection.

Contract details worth stating explicitly:

- **This endpoint cannot return an eligibility verdict, by
  construction.** Every catalog entry carries at least one criterion of
  kind `manual`, which always evaluates to `cannot_check`, and
  `Evaluate Criteria` drops any scheme whose criteria contain no
  `cannot_check`. So every scheme returned carries something the farmer
  still has to confirm. The three groups mean:
  - `matched` — nothing recorded contradicts it, and something checkable
    passed;
  - `needs_check` — nothing recorded bears on it either way;
  - `other` — something recorded contradicts a condition.
- **A farm with no state still gets an answer.** Central schemes apply
  nationwide, so the call runs; `stateSchemesSkipped` counts the state
  schemes that could not be considered, and the page says so rather than
  silently returning a shorter list.
- **Scheme content is never derived from the request.** The catalog is a
  fixed constant inside the workflow, so a crafted payload cannot
  introduce or alter a scheme. Nothing is generated by an LLM.
- `catalogVerifiedOn` (when a person last checked the oldest entry) is
  separate from `asOf` (when this request ran) — conflating them would
  overstate how current the scheme information is.
- Criteria travel as `key` + `params`, not prose, so the frontend renders
  them through i18n in the farmer's own language. Scheme names, purposes
  and benefits stay in the official source's wording.

Nothing from this endpoint is persisted — it is a read-only discovery
list, so there is no table and no migration behind it.

## Planned, in build order

1. `POST /webhook/soil` — Soil Agent
2. `POST /webhook/orchestrator` — Orchestrator (fronts Decision Agent +
   Language/Voice Service once the above are individually proven)
