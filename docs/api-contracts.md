# API Contracts

There is no custom backend — the frontend talks directly to Supabase and
directly to n8n webhooks (see `docs/architecture.md`). This file tracks
those two contract surfaces as they're built. Nothing is implemented yet
(Phase 0 was scaffolding only); the first real contract is the Weather
Agent webhook, built per the report's step-by-step order.

## Conventions

- Every n8n agent webhook responds with the `DataResult<T>` shape from
  `packages/shared-types`:
  ```ts
  { status: "ok", asOf: string, source: string, data: T }
  | { status: "unavailable", reason: string }
  ```
- Every webhook call carries `Authorization: Bearer <supabase-jwt>`
  (see `apps/web/src/lib/n8nClient.ts`); the workflow verifies it before
  touching any farm-specific data.
- Supabase access is scoped by row-level security policies keyed to
  `auth.uid()` — every table a farmer can read/write must have a policy
  restricting rows to their own `farmer_id` (directly, or via the
  farm/crop they own).

## Currently implemented

Nothing yet.

## Planned, in build order

1. `POST /webhook/weather` — Weather Agent (first live-data vertical)
2. `POST /webhook/crop-diagnosis` — Crop Diagnosis Agent
3. `POST /webhook/soil` — Soil Agent
4. `POST /webhook/market` — Market Agent
5. `POST /webhook/schemes` — Government Scheme Agent
6. `POST /webhook/orchestrator` — Orchestrator (fronts Decision Agent +
   Language/Voice Service once the above are individually proven)
