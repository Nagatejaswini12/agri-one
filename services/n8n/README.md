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

Live in n8n Cloud as two workflows:

| Workflow | ID | Role |
|---|---|---|
| `Crop Diagnosis - Core` | `AOURgRfTVM9bsGzV` | The logic. Exported here as `crop-diagnosis-core.json`. |
| `Crop Diagnosis API` | `FPR9ZKAIO6ql9E8v` | Public `POST /webhook/crop-diagnosis`. Calls Core, responds to the webhook. Not exported here — MCP access is disabled on it, so it can't be read programmatically. |

The frontend calls the API workflow through
`callAgentWebhook("crop-diagnosis", …)` with `{ imageUrl, cropName, locale }`,
where `imageUrl` is a 120-second Supabase signed URL. Core never touches
Supabase — the frontend persists the `scans` row itself (see
`docs/architecture.md`), so n8n holds no Storage or DB credential for
this feature.

### Core pipeline

```
Core Trigger → Download Image → Resize Image → Image To Base64
             → Base64 To File → Roboflow Detect → API Failed?
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

Three node choices are deliberate and easy to break by "simplifying":

- **Resize Image** caps the longest side at 1024px. Phone photos are
  several MB, and n8n streams large request bodies — after which it
  hands back an unparsed stream object instead of Roboflow's JSON.
- **Image To Base64 + Base64 To File** exist because Roboflow requires a
  base64 *string*. Sending it as a raw body triggers the same streaming
  problem, and sending the image as binary makes Roboflow reject it
  ("contains raw bytes instead of a base64-encoded string"). Wrapping the
  base64 text as a binary property uses the HTTP node's binary-upload
  path, which parses the response correctly.
- **Download Image has `onError: continueErrorOutput`** wired to
  `Build Unavailable Result`, so an unreachable image URL produces a
  `status: "unavailable"` payload instead of an HTTP 500.

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
