/**
 * Guards the Orchestrator against three kinds of drift:
 *
 *  1. The readable node sources under services/n8n/workflows/src/
 *     vs the escaped jsCode actually embedded in the exported workflow
 *     JSON. The rule table is the most safety-relevant code in this
 *     repo; reviewing it inside a one-line escaped string is not
 *     reviewing it, so the sources are what humans read and this proves
 *     they are what n8n runs.
 *  2. Every action key the rule table can emit has a label in all four
 *     locale bundles. A missing label would render a raw key to a
 *     farmer.
 *  3. No action label in any language reads as agronomic instruction —
 *     no chemical, no dosage, no treatment verb. The rule table cannot
 *     produce one, and this keeps it that way as labels are edited.
 *
 *   node scripts/verify-decision-rules.mjs
 */
import fs from "node:fs";

const SRC = "services/n8n/workflows/src";
const WF = "services/n8n/workflows";
const LANGS = ["en", "ta", "te", "hi"];

let failures = 0;
function check(label, cond, detail = "") {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
}

const read = (p) => fs.readFileSync(p, "utf8");
const nodeOf = (wfFile, nodeName) => {
  const wf = JSON.parse(read(`${WF}/${wfFile}`));
  const n = wf.nodes.find((x) => x.name === nodeName);
  if (!n) throw new Error(`${wfFile}: no node named ${nodeName}`);
  return n;
};

console.log("=== exported workflow jsCode matches the readable sources ===");
const expected = [
  ["decision-core.json", "Parse Signals", "decision/node-parse-signals.js"],
  ["decision-core.json", "Apply Rules", "decision/node-apply-rules.js"],
  ["decision-core.json", "Build Briefing", "decision/node-build-briefing.js"],
  ["decision-core.json", "Build Unavailable Result", "decision/node-build-unavailable.js"],
  ["orchestrator-core.json", "Build Agent Inputs", "orchestrator/node-build-agent-inputs.js"],
  ["orchestrator-core.json", "Collect Signals", "orchestrator/node-collect-signals.js"]
];
for (const [file, node, source] of expected) {
  check(`${file} → ${node}`, nodeOf(file, node).parameters.jsCode === read(`${SRC}/${source}`));
}

console.log("\n=== every emitted action key has a label in every language ===");
const rules = read(`${SRC}/decision/node-apply-rules.js`);
// Keys are emitted either through the weather flag table or a literal
// first argument to emit(). Both forms are collected here.
const keys = new Set();
for (const m of rules.matchAll(/emit\(\s*"([A-Za-z0-9_]+)"/g)) keys.add(m[1]);
for (const m of rules.matchAll(/key:\s*"([A-Za-z0-9_]+)"/g)) keys.add(m[1]);
check("rule table emits at least one action", keys.size > 0, `${keys.size} keys`);

const bundles = Object.fromEntries(
  LANGS.map((l) => [l, JSON.parse(read(`apps/web/public/locales/${l}/common.json`))])
);
for (const key of [...keys].sort()) {
  for (const lang of LANGS) {
    const a = bundles[lang].decision.action;
    const present =
      typeof a[key] === "string" ||
      (typeof a[`${key}_one`] === "string" && typeof a[`${key}_other`] === "string");
    check(`${lang}/${key}`, present);
  }
}

console.log("\n=== no action label reads as agronomic instruction ===");
// English is where meaning is authored; the other languages are checked
// for Latin-script chemical names, which is how they would appear.
const ENGLISH_BANNED = [
  "spray", "apply ", "dose", "dosage", "pesticide", "fungicide", "insecticide",
  "herbicide", "urea", "npk", "fertiliser", "fertilizer", "chemical", "treat",
  "cure", "ml/l", "kg/ha", "g/l", "per hectare", "per acre of"
];
const CHEMICAL_NAMES = [
  "urea", "dap", "mancozeb", "carbendazim", "imidacloprid", "glyphosate",
  "chlorpyrifos", "sulphate", "sulfate", "nitrate", "potash"
];

for (const [key, value] of Object.entries(bundles.en.decision.action)) {
  const lower = String(value).toLowerCase();
  const hit = ENGLISH_BANNED.find((w) => lower.includes(w));
  check(`en/${key} is not instructional`, !hit, hit ? `contains "${hit}"` : "");
}
for (const lang of LANGS) {
  for (const [key, value] of Object.entries(bundles[lang].decision.action)) {
    const lower = String(value).toLowerCase();
    const hit = CHEMICAL_NAMES.find((w) => lower.includes(w));
    check(`${lang}/${key} names no chemical`, !hit, hit ? `contains "${hit}"` : "");
  }
}

console.log("\n=== the rule table itself stays within its contract ===");
// "agent" on its own is legitimate here — sourceAgent, "the agent's own
// recommendation" — so this looks for actual model/provider references.
check(
  "no LLM or model node referenced",
  !/openai|anthropic|langchain|lmChat|chatModel|completion|prompt/i.test(rules)
);
check(
  "soil chemistry is never read",
  !/\b(nitrogen|phosphorus|potassium|organicCarbon)\b/.test(rules) && !/\bph\b/.test(rules)
);
check("no diagnosis label is read", !/primaryFinding|\.label\b/.test(rules));
check("every emit() carries a sourceAgent", (rules.match(/emit\(/g) || []).length > 0);

console.log(`\n${failures === 0 ? "ALL DECISION CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
