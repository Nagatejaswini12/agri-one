/**
 * FINAL INTEGRATION: every exported workflow vs what n8n is running.
 *
 * The earlier per-agent checks each covered a slice. This one matches
 * every JSON in services/n8n/workflows against the live instance by
 * name, so a workflow cannot be edited in the n8n UI and quietly drift
 * from the repo — which is the failure mode that makes an exported
 * workflow a lie.
 *
 * Deliberate differences are normalised, not ignored:
 *   - the Supabase apikey header is redacted to a placeholder in the repo
 *   - node ids, positions and credential ids are instance-local
 *
 * Run from the repo root. Reads only; never writes to n8n.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const WF_DIR = "services/n8n/workflows";

let failures = 0;
const check = (label, cond, detail = "") => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
};

const cfg = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".claude.json"), "utf8"));
const proj = Object.keys(cfg.projects).find((k) => k.toLowerCase().includes("agri-one"));
const server = cfg.projects[proj].mcpServers["n8n-manage"];

let sessionId = null;
async function rpc(method, params) {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    ...server.headers
  };
  if (sessionId) headers["Mcp-Session-Id"] = sessionId;
  const res = await fetch(server.url, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params })
  });
  const sid = res.headers.get("mcp-session-id");
  if (sid) sessionId = sid;
  const text = await res.text();
  if (res.status === 429) {
    // The n8n account rate-limits management calls. Back off rather than
    // reporting a false drift.
    await new Promise((r) => setTimeout(r, 4000));
    return rpc(method, params);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const line =
    text.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).pop() ||
    text;
  return JSON.parse(line);
}

async function callTool(name, args) {
  const r = await rpc("tools/call", { name, arguments: args });
  if (r.error) return { __error: JSON.stringify(r.error).slice(0, 200) };
  const t = r.result.content[0].text;
  try {
    return JSON.parse(t);
  } catch {
    return { __text: t };
  }
}

await rpc("initialize", {
  protocolVersion: "2024-11-05",
  capabilities: {},
  clientInfo: { name: "verify-workflows", version: "1.0.0" }
});
await fetch(server.url, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    ...server.headers,
    ...(sessionId ? { "Mcp-Session-Id": sessionId } : {})
  },
  body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} })
});

/** Strip everything that is legitimately instance-local. */
function normalizeNode(node) {
  const params = JSON.parse(JSON.stringify(node.parameters ?? {}));
  // The repo keeps the Supabase apikey as a placeholder on purpose.
  for (const p of params?.headerParameters?.parameters ?? []) {
    if (/apikey|authorization/i.test(p.name ?? "")) p.value = "<redacted>";
  }
  // Sub-workflow references carry the live workflow id.
  if (params.workflowId && typeof params.workflowId === "object") {
    params.workflowId = { __ref: params.workflowId.cachedResultName ?? "<id>" };
  }
  return {
    name: node.name,
    type: node.type,
    typeVersion: node.typeVersion,
    onError: node.onError ?? null,
    parameters: params
  };
}

function normalizeConnections(conns) {
  const out = {};
  for (const [src, v] of Object.entries(conns ?? {})) {
    out[src] = (v.main ?? []).map((arr) =>
      (arr ?? []).map((c) => `${c.node}#${c.index ?? 0}`).sort()
    );
  }
  return out;
}

const listing = await callTool("search_workflows", { limit: 100 });
const live = listing.workflows ?? listing.data ?? listing.items ?? [];
check("the live workflow list is readable", live.length > 0, `${live.length} workflows`);

const byName = new Map(live.map((w) => [w.name, w]));
const files = fs.readdirSync(WF_DIR).filter((f) => f.endsWith(".json")).sort();

console.log(`\n=== ${files.length} exported workflows ===`);
const matchedNames = new Set();
const undeployed = [];

for (const file of files) {
  const exported = JSON.parse(fs.readFileSync(`${WF_DIR}/${file}`, "utf8"));
  const name = exported.name;
  const liveRow = byName.get(name);

  if (!liveRow) {
    // Not a failure: some exports describe workflows that were never
    // deployed, or were superseded. They are listed at the end so they
    // stay visible — an export nobody runs is documentation, and should
    // be known to be that rather than mistaken for shipped code.
    undeployed.push(`${file} ("${name}")`);
    continue;
  }
  matchedNames.add(name);

  const det = await callTool("get_workflow_details", { workflowId: liveRow.id });
  if (det.__error) {
    check(`${file}: readable from n8n`, false, det.__error);
    continue;
  }
  const wf = det.workflow ?? det.data ?? det;

  const expNodes = (exported.nodes ?? []).map(normalizeNode).sort((a, b) => a.name.localeCompare(b.name));
  const liveNodes = (wf.nodes ?? []).map(normalizeNode).sort((a, b) => a.name.localeCompare(b.name));

  const expNames = expNodes.map((n) => n.name);
  const liveNames = liveNodes.map((n) => n.name);
  const sameNodes = JSON.stringify(expNames) === JSON.stringify(liveNames);
  check(
    `${name}: same nodes`,
    sameNodes,
    sameNodes
      ? `${expNames.length}`
      : `repo-only: ${expNames.filter((n) => !liveNames.includes(n)).join(", ") || "none"} | live-only: ${liveNames.filter((n) => !expNames.includes(n)).join(", ") || "none"}`
  );

  if (sameNodes) {
    const drifted = [];
    for (let i = 0; i < expNodes.length; i++) {
      if (JSON.stringify(expNodes[i]) !== JSON.stringify(liveNodes[i])) drifted.push(expNodes[i].name);
    }
    check(`${name}: node parameters and versions match`, drifted.length === 0, drifted.join(", "));
  }

  const sameConns =
    JSON.stringify(normalizeConnections(exported.connections)) ===
    JSON.stringify(normalizeConnections(wf.connections));
  check(`${name}: connections match`, sameConns);

  if (typeof exported.active === "boolean") {
    check(`${name}: active flag matches`, exported.active === wf.active, `repo=${exported.active} live=${wf.active}`);
  }
}

// Anything live that the repo does not describe is reported, not failed:
// leftovers are a cleanup decision, not a correctness one.
console.log("");
console.log("=== exported but not deployed ===");
if (undeployed.length === 0) console.log("  none");
else for (const u of undeployed) console.log(`  ${u}`);

console.log("\n=== live workflows with no exported counterpart ===");
const unmatched = live.filter((w) => !matchedNames.has(w.name));
if (unmatched.length === 0) {
  console.log("  none");
} else {
  for (const w of unmatched) {
    console.log(`  ${w.id}  active=${String(w.active).padEnd(5)}  ${w.name}`);
  }
  console.log(`  (${unmatched.length} not part of the shipped application — cleanup candidates)`);
}

console.log(`\n${failures === 0 ? "EVERY EXPORTED WORKFLOW MATCHES LIVE" : `${failures} WORKFLOW CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
