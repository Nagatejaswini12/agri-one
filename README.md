# AGRI ONE

AI-powered multilingual farm decision & action platform, following
**PLAN → GROW → PROTECT → SELL**.

See [`docs/architecture.md`](docs/architecture.md) for the system design
and [`docs/data-sources.md`](docs/data-sources.md) for every external
data source and its real-data guarantees.

## Structure

- `apps/web` — React + Vite + TypeScript PWA (mobile-first, 4 languages:
  English, Tamil, Telugu, Hindi, extensible to more). Talks directly to
  Supabase and directly to n8n webhooks — there is no separate backend.
- `services/n8n` — self-hosted n8n (Docker Compose) hosting the
  Orchestrator and specialized agent workflows
- `packages/shared-types` — TypeScript types shared by `apps/web` and the
  n8n workflow payload contracts

## Prerequisites

- Node.js 20+
- Docker (for running n8n locally)
- A Supabase project (Postgres + Auth + Storage) — see `.env.example`

## Getting started

```bash
npm install

# copy env templates and fill in real values (leave anything you don't
# have yet blank — features must show "unavailable", never fake data)
cp .env.example apps/web/.env
cp services/n8n/.env.example services/n8n/.env

npm run dev:web    # frontend on http://localhost:5173

cd services/n8n && docker compose up -d   # n8n on http://localhost:5678
```

## Checks

```bash
cd apps/web
npm test          # unit tests, including i18n parity across all four languages
npm run typecheck
npm run lint
npm run build
```

From the repo root, against the live services:

| Script | What it proves |
|---|---|
| `node scripts/security-check.mjs` | Unauthenticated and forged tokens are rejected at the agent edge, RLS scopes every table to the farm's owner, Storage is scoped, and no secret is in a tracked file. Skips the agent-edge checks with a notice when the n8n host is not executing, rather than reporting a pass it did not earn. |
| `node scripts/verify-workflows-live.mjs` | Every exported workflow matches the workflow n8n is actually running — nodes, parameters, versions, `onError`, connections, active flag. Also lists exports that are not deployed and live workflows the repo does not describe. |
| `node scripts/verify-source-links.mjs` | Every external link the app can show a farmer is https, on an official domain, carries a verification date that is not in the future, and still responds. |
| `node scripts/verify-diagnosis-categories.mjs` | The diagnosis classifier is identical in source, export and live, and all four declared categories are reachable. |
| `node scripts/verify-decision-rules.mjs` | No briefing rule names a chemical, reads soil chemistry, or emits without a source agent. |
| `node scripts/verify-chat-answers.mjs` | No chat template names a product or claims scheme eligibility, in any language. |
| `node scripts/verify-scheme-catalog.mjs` | Every scheme keeps at least one criterion only a person can confirm, so "you are eligible" stays unconstructible. |
| `node scripts/market-e2e.mjs` | Live AGMARKNET queries across several districts, including the zero-record and unresolved-district cases. |

## Deployment

Frontend deploys to Netlify. n8n and Supabase are hosted separately.

## Status

All modules are built and wired to live sources or to the farmer's own
records. Nothing in the app shows fabricated data: when a source has
nothing to say, the screen says so.

| Module | Source |
|---|---|
| My Farms, Soil & Water, Reports | The farmer's own records (Supabase, farm-scoped RLS) |
| Weather & Advisory | Open-Meteo, live, no key |
| Crop Diagnosis, Scan History | Roboflow `crop-disease-axhjj/1` on farmer-uploaded photos |
| Market Analysis, Marketplace | AGMARKNET via data.gov.in, live |
| Government Schemes | Curated catalog of official portals, each entry source-linked and dated |
| Farm Briefing | Orchestrator + Decision agents over the above |
| Chat & Voice assistant | Browser-native speech; answers are keys rendered by react-i18next, never generated prose |
| Pest Activity | The farmer's own pest-classified scans + a curated directory of official pest resources |

Read [`docs/architecture.md`](docs/architecture.md) phase by phase for
why each module is built the way it is, and
[`docs/data-sources.md`](docs/data-sources.md) for what each source can
and cannot be asked for.

### Known limitations

- **Pest Activity depends on a narrow classifier.** The diagnosis model's
  only arthropod class is the two-spotted spider mite, so that page can
  surface that pest and nothing else. It is not general pest detection,
  and in practice the model rarely reports it. See "Phase 10" in the
  architecture doc.
- **Crop Diagnosis is a prototype.** Nine classes, tomato-focused — not
  comprehensive crop coverage, and its output is a model estimate, not a
  diagnosis.
- **Signing out clears the device, but may not revoke the server
  session.** The redirect cancels the in-flight global-logout call. The
  tokens are removed from the device regardless; the refresh token can
  stay valid server-side until it expires.
- **Four modules show a placeholder tile.** My Farms, Pest Activity,
  Marketplace and Reports (and Scan History under Tools) have no custom
  artwork yet, so they render a plain frosted tile rather than borrowing
  another module's picture. Deliberately obvious, and waiting on its own
  assets.
- **A faint checker residue survives inside the glass** on the Crop
  Diagnosis, Market and Schemes icons. The supplied artwork was exported
  with the transparency checkerboard painted into its pixels; where the
  pattern shows through tinted glass it is no longer either of the two
  tones the matte keys on, so it is cleared with a median sized to the
  checker's period. Invisible at the size the icons are used, visible if
  you zoom well past it.
- **The agents depend on the n8n instance being within its plan limits.**
  When n8n cannot execute, every agent-backed panel degrades to
  "unavailable" rather than showing stale or invented values.
