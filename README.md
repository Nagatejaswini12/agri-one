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

## Deployment

Frontend deploys to Netlify. n8n and Supabase are hosted separately.

## Status

Phase 0 (scaffolding) — no live data integrations are wired up yet. Build
order follows the project report: Weather Agent first, then Crop
Diagnosis, Soil, Market, Government Scheme, Decision Agent, multilingual/
voice, then full frontend wiring, integration testing, and deploy.
