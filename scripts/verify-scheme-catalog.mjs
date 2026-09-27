/**
 * Guards the scheme catalog against three kinds of drift:
 *
 *  1. The readable node sources under
 *     services/n8n/workflows/src/schemes/ vs the escaped jsCode actually
 *     embedded in the exported workflow JSON. Reviewing a catalog change
 *     inside a one-line escaped string is not reviewing it, so the
 *     sources are the thing humans read — and this proves they are what
 *     n8n runs.
 *  2. The catalog copy inside "Schemes Catalog Check" vs the one inside
 *     "Schemes - Core". The checker deliberately carries its own copy so
 *     it still works while Core is mid-edit; this catches them diverging.
 *  3. Catalog content rules: an official https source, a verified date,
 *     and at least one manual criterion per scheme — the last being what
 *     makes an "you are eligible" result unconstructible.
 *
 *   node scripts/verify-scheme-catalog.mjs
 */
import fs from "node:fs";

const SRC = "services/n8n/workflows/src/schemes";
const WF = "services/n8n/workflows";

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
const catalog = read(`${SRC}/catalog-literal.js`);
const expected = {
  "Load Catalog": catalog + "\n" + read(`${SRC}/node-load-catalog.js`),
  "Filter By State": read(`${SRC}/node-filter-by-state.js`),
  "Evaluate Criteria": read(`${SRC}/node-evaluate-criteria.js`),
  "Build Match Result": read(`${SRC}/node-build-match-result.js`),
  "Build Unavailable Result": read(`${SRC}/node-build-unavailable-result.js`)
};
for (const [name, source] of Object.entries(expected)) {
  check(name, nodeOf("schemes-core.json", name).parameters.jsCode === source);
}
check(
  "Collect Report",
  nodeOf("schemes-catalog-check.json", "Collect Report").parameters.jsCode ===
    read(`${SRC}/node-collect-report.js`)
);

console.log("\n=== the checker's catalog copy matches Core's ===");
const checkerCode = nodeOf("schemes-catalog-check.json", "List Catalog Entries").parameters.jsCode;
check("catalog literal is byte-identical", checkerCode.startsWith(catalog));

console.log("\n=== the repo catalog matches Core's ===");
// The TypeScript file is compared by value rather than by text: it is a
// different language from the n8n copies, so only the data can be
// compared — and the data is what a farmer sees.
const repoSrc = read("apps/web/src/modules/schemes/catalog.ts");
const repoMatch = repoSrc.match(/export const CATALOG: CatalogScheme\[\] = (\[[\s\S]*\n\]);/);
if (!repoMatch) throw new Error("catalog.ts: CATALOG literal not found");
const repoJson = JSON.parse(repoMatch[1]);
const repoVersion = (repoSrc.match(/export const CATALOG_VERSION = "([^"]+)"/) || [])[1];
const core = new Function(`${catalog}; return { CATALOG, CATALOG_VERSION };`)();

check("repo catalog version matches Core", repoVersion === core.CATALOG_VERSION,
  `repo ${repoVersion} vs core ${core.CATALOG_VERSION}`);
check("repo catalog has the same number of schemes",
  repoJson.length === core.CATALOG.length,
  `repo ${repoJson.length} vs core ${core.CATALOG.length}`);
check("repo catalog is value-identical to Core's",
  JSON.stringify(repoJson) === JSON.stringify(core.CATALOG),
  "a difference means the served catalog and the rollback copy disagree");


console.log("\n=== catalog content rules ===");
// Evaluated rather than regex-scraped, so the rules apply to the real values.
const CATALOG = new Function(`${catalog}; return { CATALOG, CATALOG_VERSION };`)().CATALOG;
check("catalog is non-empty", CATALOG.length > 0, `${CATALOG.length} schemes`);

const ids = new Set();
for (const s of CATALOG) {
  const where = s && s.id ? s.id : "(no id)";
  check(`${where}: unique id`, typeof s.id === "string" && s.id !== "" && !ids.has(s.id));
  ids.add(s.id);
  check(`${where}: official https source`, /^https:\/\//.test(s.sourceUrl || ""));
  check(`${where}: sourceName present`, typeof s.sourceName === "string" && s.sourceName.trim() !== "");
  check(`${where}: lastVerifiedOn is YYYY-MM-DD`, /^\d{4}-\d{2}-\d{2}$/.test(s.lastVerifiedOn || ""));
  check(`${where}: level is central or state`, s.level === "central" || s.level === "state");
  check(
    `${where}: a state scheme names its states`,
    s.level === "central" ? s.states.length === 0 : s.states.length > 0
  );
  check(
    `${where}: has a manual criterion`,
    Array.isArray(s.criteria) && s.criteria.some((c) => c.kind === "manual")
  );
}

console.log("\n=== every criterion key has an English label ===");
const en = JSON.parse(read("apps/web/public/locales/en/common.json"));
for (const s of CATALOG) {
  for (const c of s.criteria) {
    check(`${s.id}/${c.key}`, typeof en.schemes.criteria[c.key] === "string");
  }
}

console.log(`\n${failures === 0 ? "ALL CATALOG CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
