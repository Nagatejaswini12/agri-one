/**
 * FINAL INTEGRATION: every external link the app can show a farmer.
 *
 * Three curated lists point outward — the scheme catalog, the
 * Marketplace official selling channels, and the Pest Activity official
 * resources. Each entry claims a person checked it on a stated date. A
 * link that has since died turns that claim into a lie, and a farmer
 * follows it expecting the government.
 *
 * `Schemes Catalog Check` does this on a schedule inside n8n; this is
 * the same check runnable from the repo, so it still works when the n8n
 * instance does not.
 *
 * Reachability only: it cannot tell you the page still says what the
 * entry claims. That remains a human re-read, which is what
 * `lastVerifiedOn` records.
 */
import fs from "node:fs";

let failures = 0;
const check = (label, cond, detail = "") => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
};

/**
 * Slice just the array literal out of a TypeScript source and evaluate
 * it. Stripping types from the whole file is fragile; the literal itself
 * is plain JSON-ish data with no annotations in it.
 */
function literal(file, exportName) {
  const src = fs.readFileSync(file, "utf8");
  const marker = `export const ${exportName}`;
  const at = src.indexOf(marker);
  if (at < 0) throw new Error(`${exportName} not found in ${file}`);
  // Start at the assignment, not the first "[": the type annotation
  // (`OfficialChannel[]`) contains brackets of its own, and starting
  // there yields an empty array -- which would silently check nothing.
  const eq = src.indexOf("=", at);
  const open = src.indexOf("[", eq);
  let depth = 0;
  let i = open;
  for (; i < src.length; i++) {
    if (src[i] === "[") depth++;
    else if (src[i] === "]") {
      depth--;
      if (depth === 0) break;
    }
  }
  const parsed = new Function(`return ${src.slice(open, i + 1)};`)();
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(`${exportName} in ${file} extracted as empty — refusing to report that as "all links fine"`);
  }
  return parsed;
}

const SOURCES = [];

// 1. The curated scheme catalog (the source of truth for the others).
const catalogSrc = fs.readFileSync(
  "services/n8n/workflows/src/schemes/catalog-literal.js",
  "utf8"
);
for (const entry of new Function(`${catalogSrc}; return CATALOG;`)()) {
  SOURCES.push({ list: "schemes", id: entry.id, url: entry.sourceUrl, verified: entry.lastVerifiedOn });
}

// 2. Marketplace official selling channels.
for (const c of literal("apps/web/src/modules/marketplace/officialChannels.ts", "OFFICIAL_CHANNELS")) {
  SOURCES.push({ list: "marketplace", id: c.catalogId, url: c.sourceUrl, verified: c.lastVerifiedOn });
}

// 3. Pest Activity official resources.
for (const r of literal("apps/web/src/modules/pest-alerts/officialResources.ts", "OFFICIAL_PEST_RESOURCES")) {
  SOURCES.push({ list: "pest", id: r.id, url: r.sourceUrl, verified: r.lastVerifiedOn });
}

console.log(`=== ${SOURCES.length} externally-displayed links ===\n`);

const today = new Date().toISOString().slice(0, 10);

for (const s of SOURCES) {
  check(`${s.list}/${s.id}: https`, /^https:\/\//.test(s.url), s.url);
  check(
    `${s.list}/${s.id}: official domain`,
    /\.(gov\.in|nic\.in|res\.in)(\/|$)/.test(s.url)
  );
  check(
    `${s.list}/${s.id}: verified on or before today`,
    /^\d{4}-\d{2}-\d{2}$/.test(s.verified) && s.verified <= today,
    s.verified
  );
}

console.log("\n=== reachability ===");
const unreachable = [];
for (const s of SOURCES) {
  let status = 0;
  let note = "";
  try {
    const res = await fetch(s.url, {
      method: "GET",
      redirect: "follow",
      headers: {
        // Several state portals reject an unidentified client outright.
        "User-Agent": "Mozilla/5.0 (compatible; agri-one-link-check/1.0)",
        Accept: "text/html,application/xhtml+xml,*/*"
      },
      signal: AbortSignal.timeout(45000)
    });
    status = res.status;
  } catch (e) {
    note = e.name === "TimeoutError" ? "timeout" : e.message.slice(0, 40);
  }
  const ok = status >= 200 && status < 400;
  console.log(`  ${ok ? "PASS" : "WARN"}  ${s.list}/${s.id} — ${status || note} ${s.url}`);
  if (!ok) unreachable.push(`${s.list}/${s.id} (${status || note})`);
}

// A government portal being briefly down, slow, or blocking this client
// is not the same as the app shipping a dead link, so reachability is
// reported rather than failed. A link that stays unreachable needs a
// person to re-read it and update or remove the entry.
console.log(
  `\n${unreachable.length === 0 ? "every link responded" : `${unreachable.length} link(s) did not respond: ${unreachable.join(", ")}`}`
);

console.log(
  `\n${failures === 0 ? "ALL LINK METADATA CHECKS PASSED" : `${failures} LINK CHECK(S) FAILED`}`
);
process.exit(failures === 0 ? 0 : 1);
