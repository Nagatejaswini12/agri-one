# n8n (self-hosted, local dev)

1. `cp .env.example .env` and set a basic-auth password (leave the API keys
   blank until you have real credentials — workflows must handle missing
   keys by returning an "unavailable" result, never fake data).
2. `docker compose up -d`
3. Open http://localhost:5678 and log in with the credentials from `.env`.
4. Workflows are exported to `workflows/*.json` as they're built (Phase 2+)
   so they're versioned alongside the app, not only stored inside n8n.

No Orchestrator exists yet — this folder started as scaffolding only
(Phase 0). The Weather Agent is live directly against a farm's
lat/long, exposed as the `get_weather` tool in an existing MCP Server
workflow that isn't versioned here yet.

## Crop Diagnosis Agent (Phase 2)

Three workflows, imported in this order (**Workflows → Import from File**
in the n8n editor):

1. `crop-diagnosis-core.json` — the actual logic: downloads the image,
   calls the Kindwise Crop Health API (`CROP_HEALTH_API_KEY`), maps the
   response into the `CropDiagnosisResult` contract
   (`packages/shared-types`). Called by both of the below — never
   trigger it directly.
2. `crop-diagnosis-webhook.json` — `POST /webhook/crop-diagnosis`, the
   path the frontend calls via `callAgentWebhook()`. Verifies the
   farmer's forwarded Supabase JWT, then calls Core. It does **not**
   write to Supabase — the frontend persists the resulting `scans` row
   itself (see `docs/architecture.md`), so this workflow never needs a
   service-role key.
3. `crop-diagnosis-mcp-tool.json` — the target workflow for the
   `diagnose_crop_image(imageUrl, cropName?)` MCP tool, same shape as
   the existing `get_weather` tool. After importing it, add one new
   **"Call n8n Workflow Tool"** node to the existing live MCP Server
   workflow (the one already exposing `get_weather`), pointed at this
   workflow — that is the only change made to that workflow; the
   `get_weather` node itself is never opened or edited.

After importing, both `crop-diagnosis-webhook.json` and
`crop-diagnosis-mcp-tool.json` have an `Execute Workflow` node
("Call Core") whose `workflowPath` is a placeholder — repoint it at
`Crop Diagnosis - Core` by its workflow ID in the n8n UI.

Requires `CROP_HEALTH_API_KEY`, `SUPABASE_URL`, and `SUPABASE_ANON_KEY`
in `.env` (see `.env.example`).
