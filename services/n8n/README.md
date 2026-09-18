# n8n (self-hosted, local dev)

1. `cp .env.example .env` and set a basic-auth password (leave the API keys
   blank until you have real credentials — workflows must handle missing
   keys by returning an "unavailable" result, never fake data).
2. `docker compose up -d`
3. Open http://localhost:5678 and log in with the credentials from `.env`.
4. Workflows are exported to `workflows/*.json` as they're built (Phase 2+)
   so they're versioned alongside the app, not only stored inside n8n.

No workflows exist yet — this folder is scaffolding only (Phase 0). The
Orchestrator and specialized agent workflows described in the plan are
built starting Phase 2.
