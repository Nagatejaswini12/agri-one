/**
 * OFFLINE verification of the built /api/schemes function.
 *
 * ────────────────────────────────────────────────────────────────────
 *  THIS IS NOT LIVE VERIFICATION OF ANY GOVERNMENT SOURCE.
 *
 *  The Supabase token check is stubbed, and there is nothing else to
 *  stub: /api/schemes makes no data call at all. There is no public API
 *  for Indian scheme eligibility, so the catalog is curated by hand and
 *  ships with the code.
 *
 *  What this proves: the endpoint authenticates, matches server-side,
 *  returns the existing contract, and never produces a match without
 *  something the farmer still has to confirm.
 *
 *  What it does NOT prove: that the curated entries are still accurate.
 *  Only a human re-reading each official source can establish that, and
 *  the catalog's own lastVerifiedOn dates are the record of it.
 * ────────────────────────────────────────────────────────────────────
 *
 * Run `npm run build --workspace apps/web && npx vercel build --yes`
 * first, then `node scripts/verify-schemes-offline.mjs`.
 */

import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARTIFACT = path.join(REPO, ".vercel/output/functions/api/schemes.func/api/schemes.js");

const require_ = createRequire(import.meta.url);
let handler;
try {
  const mod = require_(ARTIFACT);
  handler = typeof mod === "function" ? mod : (mod.default ?? mod.handler);
} catch {
  console.error(`Build artifact not found at ${ARTIFACT}`);
  console.error("Run: npm run build --workspace apps/web && npx vercel build --yes");
  process.exit(1);
}
if (typeof handler !== "function") {
  console.error("The artifact exports no handler function.");
  process.exit(1);
}

const VALID_TOKEN = "offline-fixture-valid-token";

// ---- stubs ------------------------------------------------------------
const realFetch = globalThis.fetch;
let externalCalls = 0;
let nonSupabaseCalls = [];

globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input.url;
  externalCalls++;
  if (url.includes("/auth/v1/user")) {
    const auth = init?.headers?.Authorization ?? init?.headers?.authorization ?? "";
    const ok = auth === `Bearer ${VALID_TOKEN}`;
    return new Response(JSON.stringify(ok ? { id: "fixture-user" } : { error: "invalid" }), {
      status: ok ? 200 : 401,
      headers: { "content-type": "application/json" }
    });
  }
  nonSupabaseCalls.push(url);
  throw new Error(`offline: unexpected external call to ${url}`);
};

process.env.SUPABASE_URL ??= "https://offline.invalid";
process.env.SUPABASE_ANON_KEY ??= "offline-fixture-anon-key";

const call = (body, tok = VALID_TOKEN, method = "POST") =>
  handler(new Request("https://example.test/api/schemes", {
    method,
    headers: { "content-type": "application/json", ...(tok ? { authorization: `Bearer ${tok}` } : {}) },
    ...(method === "POST" ? { body: JSON.stringify(body) } : {})
  }));

let pass = 0, fail = 0;
const check = (n, ok, d = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${n}${d ? " - " + d : ""}`); ok ? pass++ : fail++; };
const section = (s) => console.log(`\n${s}`);

console.log("OFFLINE endpoint checks - no data call exists to stub, Supabase auth is stubbed\n");

// ---- authentication ---------------------------------------------------
section("[OFFLINE] authentication");
check("GET is rejected", (await call({}, VALID_TOKEN, "GET")).status === 405);
const noTok = await call({}, null);
check("a request with no token is refused", noTok.status === 401, String(noTok.status));
check("the refusal uses the existing DataResult shape",
  (await noTok.clone().json()).status === "unavailable");
const badTok = await call({}, "not-the-valid-token");
check("a token Supabase rejects is refused", badTok.status === 401);

// ---- missing farm -----------------------------------------------------
section("[OFFLINE] missing farm / empty request");
const bare = await (await call({})).json();
check("an empty request still returns central schemes",
  bare.status === "ok" && bare.data.matches.length > 0,
  bare.status === "ok" ? `${bare.data.matches.length} matches` : bare.reason);
check("and reports the state schemes it could not consider",
  bare.status === "ok" && bare.data.stateSchemesSkipped === 4,
  bare.status === "ok" ? String(bare.data.stateSchemesSkipped) : "");

// ---- no-state farm ----------------------------------------------------
section("[OFFLINE] a farm with no state");
const noState = await (await call({ state: null, district: null, areaAcres: 2, crops: ["Tomato"], locale: "en" })).json();
check("central schemes are returned", noState.status === "ok" && noState.data.matches.length > 0);
check("every returned scheme is central",
  noState.status === "ok" && noState.data.matches.every((m) => m.scheme.level === "central"));
check("stateSchemesSkipped is correct", noState.status === "ok" && noState.data.stateSchemesSkipped === 4);
check("state is reported as null, never guessed", noState.status === "ok" && noState.data.state === null);

// ---- state farms ------------------------------------------------------
section("[OFFLINE] state farms");
for (const [state, expectId] of [
  ["Tamil Nadu", "tn-uzhavar-sandhai"],
  ["Maharashtra", "mh-mahadbt-farmer"],
  ["Karnataka", "ka-raitamitra"]
]) {
  const r = await (await call({ state, district: "X", areaAcres: 2, crops: ["Tomato"], locale: "en" })).json();
  const stateOnes = r.status === "ok" ? r.data.matches.filter((m) => m.scheme.level === "state") : [];
  check(`${state}: resolves and skips nothing`,
    r.status === "ok" && r.data.state === state && r.data.stateSchemesSkipped === 0);
  check(`${state}: its own state scheme is present`,
    stateOnes.some((m) => m.scheme.id === expectId), expectId);
  check(`${state}: no other state's scheme leaks in`,
    stateOnes.every((m) => m.scheme.states.includes(state)));
}

const noStateSchemes = await (await call({ state: "Bihar", areaAcres: 2, crops: ["Tomato"] })).json();
check("a supported state with no state-level schemes gets only central ones",
  noStateSchemes.status === "ok" &&
  noStateSchemes.data.state === "Bihar" &&
  noStateSchemes.data.matches.every((m) => m.scheme.level === "central"));

const unresolvable = await (await call({ state: "Atlantis", areaAcres: 2, crops: [] })).json();
check("an unresolvable state is treated as no state, never guessed",
  unresolvable.status === "ok" && unresolvable.data.state === null &&
  unresolvable.data.askedState === "Atlantis");

// ---- the safety invariant ---------------------------------------------
section("[OFFLINE] the invariant: no bare 'eligible' verdict is constructible");
const probes = [
  {},
  { state: "Tamil Nadu", areaAcres: 2, crops: ["Tomato"] },
  { state: "Maharashtra", areaAcres: 0.5, crops: ["Onion", "Wheat"] },
  { state: "Karnataka", areaAcres: 10000, crops: ["Ragi"] },
  { state: null, areaAcres: null, crops: [] },
  { state: "Kerala", areaAcres: 1, crops: [] },
  { state: "tamilnadu", areaAcres: "2", crops: "Tomato,Onion" }
];
let checkedMatches = 0;
let invariantHeld = true;
for (const p of probes) {
  const r = await (await call(p)).json();
  if (r.status !== "ok") continue;
  for (const m of r.data.matches) {
    checkedMatches++;
    if (!m.criteria.some((c) => c.status === "cannot_check")) {
      invariantHeld = false;
      console.log(`    VIOLATION: ${m.scheme.id} for ${JSON.stringify(p)}`);
    }
  }
}
check("every returned match retains at least one cannot_check criterion",
  invariantHeld, `${checkedMatches} matches across ${probes.length} requests`);

// ---- contract ---------------------------------------------------------
section("[OFFLINE] response contract");
const c = await (await call({ state: "Tamil Nadu", district: "Coimbatore", areaAcres: 2, crops: ["Tomato"], locale: "en" })).json();
check("status ok", c.status === "ok", c.reason ?? "");
if (c.status === "ok") {
  check("source names the curated catalog", c.source === "agri-one-curated-scheme-catalog", c.source);
  check("catalogVersion is the pinned one", c.data.catalogVersion === "2026-09-21", c.data.catalogVersion);
  check("catalogVerifiedOn is the pinned one", c.data.catalogVerifiedOn === "2026-09-21", String(c.data.catalogVerifiedOn));
  check("totalSchemes is ten", c.data.totalSchemes === 10, String(c.data.totalSchemes));
  check("district travels through", c.data.district === "Coimbatore");
  check("askedState travels through", c.data.askedState === "Tamil Nadu");
  check("every match has a group, criteria and a stale flag",
    c.data.matches.every((m) =>
      ["matched", "needs_check", "other"].includes(m.group) &&
      Array.isArray(m.criteria) && m.criteria.length > 0 &&
      typeof m.stale === "boolean"));
  check("every scheme carries a source link and a verified date",
    c.data.matches.every((m) => /^https:\/\//.test(m.scheme.sourceUrl) && m.scheme.lastVerifiedOn));
  check("asOf is this request, not the catalog date",
    c.asOf.slice(0, 10) !== c.data.catalogVerifiedOn);
}

// ---- no external data call --------------------------------------------
section("[OFFLINE] the endpoint makes no data call");
check("the only external requests were Supabase token checks",
  nonSupabaseCalls.length === 0,
  nonSupabaseCalls.length ? nonSupabaseCalls.join(", ") : `${externalCalls} supabase call(s), 0 others`);

globalThis.fetch = realFetch;
console.log(`\n${pass} passed, ${fail} failed`);
console.log("\nNOTE: the scheme catalog is curated by hand. A green run here says");
console.log("the pipeline is correct, not that the entries are still current.");
process.exit(fail ? 1 : 0);
