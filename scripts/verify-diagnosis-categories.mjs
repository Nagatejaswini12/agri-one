/**
 * Proves the Crop Diagnosis classifier is the same in all three places
 * it exists — the authored source, the exported workflow JSON, and the
 * workflow n8n is actually running — and that it emits exactly the four
 * categories `DiagnosisCategory` declares.
 *
 * This check exists because the gap it guards was invisible for three
 * phases: `pest` was in the type union and accepted by the frontend
 * normalizer, while the agent could only ever produce three categories.
 * A page that filters on `category === "pest"` would have shown a
 * farmer an empty list forever and called it "no pest activity".
 *
 * Run from the repo root. Reads only — it never writes to n8n.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const WF_ID = "AOURgRfTVM9bsGzV";
const NODE = "Map Diagnosis Result";
const SRC = "services/n8n/workflows/src/diagnosis/node-map-diagnosis-result.js";
const EXPORT = "services/n8n/workflows/crop-diagnosis-core.json";

/** The four values declared in packages/shared-types. */
const CATEGORIES = ["disease", "pest", "healthy", "inconclusive"];

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
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const line =
    text.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).pop() ||
    text;
  return JSON.parse(line);
}

const source = fs.readFileSync(SRC, "utf8");
const exported = JSON.parse(fs.readFileSync(EXPORT, "utf8")).nodes.find((n) => n.name === NODE)
  .parameters.jsCode;

console.log("=== source vs exported JSON ===");
check("the exported workflow carries the authored source byte-for-byte", source === exported);

console.log("\n=== the classifier's reachable categories ===");
const start = source.indexOf("const HEALTHY_PATTERN");
const fnStart = source.indexOf("function categoriseLabel", start);
const end = source.indexOf("\n}", fnStart) + 2;
const categoriseLabel = new Function(
  `${source.slice(start, end)}; return categoriseLabel;`
)();

const PROBES = [
  ["Tomato Spider mites Two-spotted spider mite", "pest"],
  ["Tomato___Spider_mites_Two-spotted_spider_mite", "pest"],
  ["Tomato Early blight", "disease"],
  ["Tomato Bacterial spot", "disease"],
  ["Tomato Yellow Leaf Curl Virus", "disease"],
  ["Tomato healthy", "healthy"],
  ["Tomato leaf", "inconclusive"],
  ["", "inconclusive"]
];
for (const [label, expected] of PROBES) {
  const actual = categoriseLabel(label);
  check(`${JSON.stringify(label)} -> ${expected}`, actual === expected, actual);
}

const reachable = new Set(PROBES.map(([l]) => categoriseLabel(l)));
check(
  "all four declared categories are reachable",
  CATEGORIES.every((c) => reachable.has(c)),
  [...reachable].sort().join(", ")
);
check(
  "no category outside the union is produced",
  [...reachable].every((c) => CATEGORIES.includes(c))
);

console.log("\n=== the node names no chemical or treatment ===");
const BANNED = [
  "spray", "dosage", "pesticide", "fungicide", "insecticide", "herbicide",
  "acaricide", "miticide", "kg/ha", "ml/l", "neem oil", "mancozeb", "abamectin"
];
const lower = source.toLowerCase();
for (const word of BANNED) check(`does not mention "${word}"`, !lower.includes(word));
check("careGuidance.culturalPractices is still empty", /culturalPractices:\s*\[\]/.test(source));
check("careGuidance.monitoring is still empty", /monitoring:\s*\[\]/.test(source));

console.log("\n=== live n8n ===");
await rpc("initialize", {
  protocolVersion: "2024-11-05",
  capabilities: {},
  clientInfo: { name: "verify-diagnosis", version: "1.0.0" }
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

const res = await rpc("tools/call", {
  name: "get_workflow_details",
  arguments: { workflowId: WF_ID }
});
const payload = JSON.parse(res.result.content[0].text);
const wf = payload.workflow ?? payload.data ?? payload;
const live = wf.nodes.find((n) => n.name === NODE).parameters.jsCode;

check("the live workflow is the one we think it is", wf.name === "Crop Diagnosis - Core", wf.name);
check("live code matches the shipped source", live === source);
check("live can emit pest", /["']pest["']/.test(live));

console.log(
  `\n${failures === 0 ? "ALL DIAGNOSIS CATEGORY CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`
);
process.exit(failures === 0 ? 0 : 1);
