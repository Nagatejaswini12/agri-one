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
import { spawnSync } from "node:child_process";

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

console.log("\n=== the repo rule table matches the n8n one ===");
// The Orchestrator is now served from /api/orchestrator, which uses
// apps/web/src/modules/dashboard/decisionRules.ts. The n8n workflow is
// kept as a rollback copy, so the rule table exists in two places and
// they must not drift — this is the most safety-relevant code in the
// repo, and a rule that quietly diverges is a rule nobody reviewed.
const REPO_RULES = "apps/web/src/modules/dashboard/decisionRules.ts";
const repoRules = read(REPO_RULES);

// Four market keys are emitted through a ternary inside a multi-line
// emit( call, which the "emit(" regex cannot see. Collect those from
// both sources so the two sides are counted the same way.
const TERNARY_KEYS = /\?\s*"([A-Za-z0-9_]+)"\s*:\s*"([A-Za-z0-9_]+)"/g;
for (const m of rules.matchAll(TERNARY_KEYS)) { keys.add(m[1]); keys.add(m[2]); }

const repoKeys = new Set();
for (const m of repoRules.matchAll(/emit\(\s*"([A-Za-z0-9_]+)"/g)) repoKeys.add(m[1]);
for (const m of repoRules.matchAll(/key:\s*"([A-Za-z0-9_]+)"/g)) repoKeys.add(m[1]);
for (const m of repoRules.matchAll(TERNARY_KEYS)) { repoKeys.add(m[1]); repoKeys.add(m[2]); }

const n8nList = [...keys].sort().join(",");
const repoList = [...repoKeys].sort().join(",");
check("the repo table emits the same keys as n8n", n8nList === repoList,
  n8nList === repoList ? `${repoKeys.size} keys` : `n8n ${n8nList} vs repo ${repoList}`);

// Plain string scans rather than constructed regexes: building one from
// a template literal silently drops its escapes.
const valueOf = (txt, name) => {
  const i = txt.indexOf(name + " =");
  if (i < 0) return null;
  const rest = txt.slice(i + name.length + 2, i + name.length + 24).trim();
  const d = rest.match(/^[0-9.]+/);
  return d ? d[0] : null;
};
for (const name of ["SPREAD_THRESHOLD", "SCAN_WINDOW_DAYS", "SOIL_STALE_DAYS"]) {
  const a = valueOf(rules, name);
  const b = valueOf(repoRules, name);
  check(`${name} matches`, !!a && a === b, `n8n ${a} vs repo ${b}`);
}

// groupComparableQuotes decides whether two prices are comparable at
// all. A divergence here is how a farmer gets told one mandi pays 87x
// another when the real difference is that it is a different product.
//
// Compared by BEHAVIOUR, not by text. An earlier text comparison here
// was matching the TypeScript return-type annotation instead of the
// function body and reporting a divergence that did not exist. Running
// both against the same fixtures is immune to formatting and is the
// property that actually matters.
const bodyFrom = (txt) => {
  const listAt = txt.indexOf("const list", txt.indexOf("function groupComparableQuotes"));
  if (listAt < 0) return null;
  const from = txt.lastIndexOf("{", listAt);
  let depth = 0;
  for (let j = from; j < txt.length; j++) {
    if (txt[j] === "{") depth++;
    else if (txt[j] === "}") { depth--; if (depth === 0) return txt.slice(from, j + 1); }
  }
  return null;
};
const FIXTURES = [
  [{ market: "A", modalPrice: 4500, variety: "Bellary", grade: "FAQ" },
   { market: "B", modalPrice: 8700, variety: "Onion Green", grade: "FAQ" },
   { market: "C", modalPrice: 4700, variety: "Bellary", grade: "FAQ" }],
  [{ market: "A", modalPrice: 1000, variety: null, grade: null },
   { market: "B", modalPrice: 1200, variety: null, grade: null }],
  [{ market: "", modalPrice: 100 }, { market: "X", modalPrice: null }, null, "junk"],
  [],
  [{ market: "A", modalPrice: 500, variety: "L", grade: "A" },
   { market: "A", modalPrice: 600, variety: "L", grade: "B" }]
];

let groupAgrees = true;
try {
  // The n8n copy is plain JS and can be evaluated here. The repo copy is
  // TypeScript, so it is imported by a child process with type stripping
  // rather than having its types regex-stripped — an earlier attempt to
  // do that mangled a nested generic and reported a divergence that did
  // not exist.
  const n8nFn = new Function(
    `function groupComparableQuotes(quotes) ${bodyFrom(rules)}; return groupComparableQuotes;`
  )();
  const child = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "--input-type=module", "-e",
     `import { groupComparableQuotes } from "./${REPO_RULES}";
      const F = ${JSON.stringify(FIXTURES)};
      console.log(JSON.stringify(F.map((f) => groupComparableQuotes(f))));`],
    { encoding: "utf8" }
  );
  if (child.status !== 0) throw new Error((child.stderr || "").split(String.fromCharCode(10))[0] || "child failed");
  const repoOut = JSON.parse(child.stdout.trim().split(String.fromCharCode(10)).pop());
  FIXTURES.forEach((f, i) => {
    if (JSON.stringify(n8nFn(f)) !== JSON.stringify(repoOut[i])) {
      groupAgrees = false;
      console.log(`    DIVERGENCE on ${JSON.stringify(f).slice(0, 70)}`);
    }
  });
} catch (e) {
  groupAgrees = false;
  console.log(`    could not compare both copies: ${e.message.slice(0, 100)}`);
}
check("groupComparableQuotes behaves identically", groupAgrees, `${FIXTURES.length} fixtures`);

console.log("\n=== the repo table names no chemical or treatment ===");
const repoLower = repoRules.toLowerCase();
for (const word of ENGLISH_BANNED) {
  check(`repo table does not emit "${word}"`, !repoLower.includes(`"${word}`));
}


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
