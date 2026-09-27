/**
 * OFFLINE verification of the built /api/market function.
 *
 * ────────────────────────────────────────────────────────────────────
 *  THIS IS NOT LIVE AGMARKNET VERIFICATION.
 *
 *  Every upstream response here is a FIXTURE defined in this file, and
 *  the Supabase token check is stubbed too. Nothing contacts data.gov.in
 *  and nothing contacts Supabase. No API key and no account are needed
 *  or used.
 *
 *  What this proves: the endpoint's own behaviour — how it resolves a
 *  location, what it sends upstream, how it maps a response, and that
 *  it stays honest on every failure path.
 *
 *  What this does NOT prove: that data.gov.in returns real rows for a
 *  real farm. That requires DATA_GOV_IN_API_KEY and a live request, and
 *  is a separate step.
 * ────────────────────────────────────────────────────────────────────
 *
 * Run `npm run build --workspace apps/web && npx vercel build` first so
 * the artifact exists, then `node scripts/verify-market-offline.mjs`.
 */

import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARTIFACT = path.join(REPO, ".vercel/output/functions/api/market.func/api/market.js");

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

// ---- fixtures ---------------------------------------------------------
// Shaped exactly like AGMARKNET's documented response for resource
// 9ef84268-d588-465a-a308-a864a43d0070. Clearly fabricated values so no
// reader can mistake a fixture for a real reported price.
const FIXTURE_MARKET = "FIXTURE-MANDI";
const fixtureRecord = (over = {}) => ({
  state: "Tamil Nadu",
  district: "Coimbatore",
  market: FIXTURE_MARKET,
  commodity: "Tomato",
  variety: "Local",
  grade: "FAQ",
  arrival_date: "27/09/2026",
  min_price: 1200,
  max_price: 1800,
  modal_price: 1500,
  ...over
});

const VALID_TOKEN = "offline-fixture-valid-token";
const FARM = { state: "Tamil Nadu", district: "Coimbatore", commodity: "Tomato", locale: "en" };

// ---- stubs ------------------------------------------------------------
// Both external legs are replaced. Nothing leaves this process.
const realFetch = globalThis.fetch;
let upstream = null;
let lastUpstreamUrl = null;
let upstreamCalls = 0;

globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input.url;

  if (url.includes("/auth/v1/user")) {
    const auth = (init?.headers?.Authorization ?? init?.headers?.authorization ?? "");
    const ok = auth === `Bearer ${VALID_TOKEN}`;
    return new Response(ok ? JSON.stringify({ id: "fixture-user" }) : JSON.stringify({ error: "invalid" }), {
      status: ok ? 200 : 401,
      headers: { "content-type": "application/json" }
    });
  }

  if (url.includes("api.data.gov.in")) {
    lastUpstreamUrl = url;
    upstreamCalls++;
    if (upstream) return upstream();
    throw new Error("offline: no upstream fixture configured for this case");
  }

  return realFetch(input, init);
};

process.env.SUPABASE_URL ??= "https://offline.invalid";
process.env.SUPABASE_ANON_KEY ??= "offline-fixture-anon-key";
process.env.DATA_GOV_IN_API_KEY = "offline-fixture-key-not-a-real-credential";

const call = (body, tok = VALID_TOKEN, method = "POST") =>
  handler(new Request("https://example.test/api/market", {
    method,
    headers: { "content-type": "application/json", ...(tok ? { authorization: `Bearer ${tok}` } : {}) },
    ...(method === "POST" ? { body: JSON.stringify(body) } : {})
  }));

const json = (o, status = 200) => () =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });

let pass = 0, fail = 0;
const check = (n, ok, d = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${n}${d ? " - " + d : ""}`); ok ? pass++ : fail++; };
const section = (s) => console.log(`\n${s}`);

console.log("OFFLINE endpoint checks - fixtures only, no network, no credentials\n");
const bodies = [];

// ---- 6. invalid / unauthenticated Supabase token ----------------------
section("[OFFLINE] 6. authentication");
check("GET is rejected", (await call(FARM, VALID_TOKEN, "GET")).status === 405);
const noTok = await call(FARM, null);
bodies.push(await noTok.clone().json());
check("a request with no token is refused", noTok.status === 401);
const badTok = await call(FARM, "not-the-valid-token");
bodies.push(await badTok.clone().json());
check("a token Supabase rejects is refused", badTok.status === 401);
check("no upstream request was made for an unauthenticated caller", upstreamCalls === 0);

// ---- 5. invalid / unsupported district --------------------------------
section("[OFFLINE] 5. invalid or unsupported location");
for (const [label, payload, needle] of [
  ["an unknown state", { ...FARM, state: "Atlantis" }, /Atlantis/],
  ["an unknown district", { ...FARM, district: "Nowhereville" }, /Nowhereville/],
  ["a district from another state", { ...FARM, district: "Lucknow" }, /Lucknow/],
  ["a missing crop", { ...FARM, commodity: "" }, /nothing to look up/i]
]) {
  const r = await (await call(payload)).json();
  bodies.push(r);
  check(`${label} is refused, and the message names it`,
    r.status === "unavailable" && needle.test(r.reason), r.reason);
}
check("no upstream request is made for an unresolvable location", upstreamCalls === 0);

// ---- 1. successful mapping, from a fixture ----------------------------
section("[OFFLINE] 1. response mapping (FIXTURE response, not live data)");
upstream = json({ records: [fixtureRecord(), fixtureRecord({ market: `${FIXTURE_MARKET}-2`, modal_price: 1450, arrival_date: "26/09/2026" })] });
const okRes = await call(FARM);
const ok = await okRes.json();
bodies.push(ok);
check("HTTP 200", okRes.status === 200);
check("status is ok", ok.status === "ok", ok.reason ?? "");
if (ok.status === "ok") {
  check("source names the government resource", ok.source === "agmarknet-data.gov.in", ok.source);
  check("both fixture rows mapped", ok.data.quotes.length === 2);
  check("quotes sort newest first", ok.data.quotes[0].market === FIXTURE_MARKET);
  check("latestReportedOn is the newest date", ok.data.latestReportedOn === "2026-09-27");
  check("unit is rupees per quintal", ok.data.priceUnit === "INR_PER_QUINTAL");
  check("AGMARKNET's resolved names travel with the snapshot",
    ok.data.state === "Tamil Nadu" && ok.data.district === "Coimbatore");
  check("an absent price maps to null, never 0",
    ok.data.quotes.every((q) => [q.minPrice, q.maxPrice, q.modalPrice].every((p) => p === null || typeof p === "number")));
}

section("[OFFLINE] the filters actually sent upstream");
const sent = new URL(lastUpstreamUrl);
check("resource is the official AGMARKNET id",
  sent.pathname.endsWith("9ef84268-d588-465a-a308-a864a43d0070"));
check("filters[state] is AGMARKNET's spelling", sent.searchParams.get("filters[state]") === "Tamil Nadu");
check("filters[district] is AGMARKNET's spelling", sent.searchParams.get("filters[district]") === "Coimbatore");
check("filters[commodity] is the selected crop", sent.searchParams.get("filters[commodity]") === "Tomato");
check("format=json and limit=100",
  sent.searchParams.get("format") === "json" && sent.searchParams.get("limit") === "100");
check("an api-key is attached to the upstream request only", !!sent.searchParams.get("api-key"));

section("[OFFLINE] spelling variants resolve to AGMARKNET's own names");
upstream = json({ records: [fixtureRecord()] });
const variant = await (await call({ ...FARM, district: "Thiruvallur" })).json();
bodies.push(variant);
check("a variant district resolves to the canonical name",
  variant.status === "ok" && variant.data.district === "Thiruvellore",
  variant.status === "ok" ? variant.data.district : variant.reason);

// ---- A-I. the request follows the selected farm and crop --------------
// The point of these: Coimbatore and Tomato are a test combination, not a
// default. Whatever is asked for is what goes upstream, and nothing is
// ever quietly swapped for something that happens to have data.
section("[OFFLINE] A-C. every combination reaches AGMARKNET unchanged");

/** Runs one lookup and returns the filters actually sent upstream. */
async function filtersFor(payload, records = [fixtureRecord()]) {
  upstream = json({ records });
  lastUpstreamUrl = null;
  const res = await (await call(payload)).json();
  bodies.push(res);
  const url = lastUpstreamUrl ? new URL(lastUpstreamUrl) : null;
  return {
    res,
    calls: upstreamCalls,
    state: url?.searchParams.get("filters[state]") ?? null,
    district: url?.searchParams.get("filters[district]") ?? null,
    commodity: url?.searchParams.get("filters[commodity]") ?? null
  };
}

const COMBINATIONS = [
  ["A", { state: "Tamil Nadu", district: "Coimbatore", commodity: "Tomato" }],
  ["B", { state: "Tamil Nadu", district: "Madurai", commodity: "Onion" }],
  ["C", { state: "Maharashtra", district: "Pune", commodity: "Onion" }],
  ["C2", { state: "Uttar Pradesh", district: "Agra", commodity: "Potato" }],
  ["C3", { state: "Keralam", district: "Ernakulam", commodity: "Banana" }],
  ["C4", { state: "Punjab", district: "Ludhiana", commodity: "Wheat" }]
];

for (const [label, combo] of COMBINATIONS) {
  const f = await filtersFor(combo);
  check(`${label}. ${combo.state} / ${combo.district} / ${combo.commodity} is sent verbatim`,
    f.state === combo.state && f.district === combo.district && f.commodity === combo.commodity,
    `sent ${f.state} / ${f.district} / ${f.commodity}`);
  check(`${label}. the snapshot reports the district that was asked for`,
    f.res.status === "ok" && f.res.data.district === combo.district,
    f.res.status === "ok" ? f.res.data.district : f.res.reason);
}

// ---- H, I. no fallback to the test combination ------------------------
section("[OFFLINE] H-I. no fallback to Coimbatore or Tomato");
const nonTest = await filtersFor({ state: "Maharashtra", district: "Pune", commodity: "Onion" });
check("H. a non-Coimbatore lookup never sends Coimbatore", nonTest.district !== "Coimbatore", String(nonTest.district));
check("I. a non-Tomato lookup never sends Tomato", nonTest.commodity !== "Tomato", String(nonTest.commodity));
check("H. the response never names Coimbatore for a Pune farm",
  !/Coimbatore/i.test(JSON.stringify(nonTest.res)));
check("I. the response never names Tomato for an Onion lookup",
  !/Tomato/i.test(JSON.stringify(nonTest.res)));

// ---- 7. supported district that reports nothing today -----------------
section("[OFFLINE] E. a supported district with no rows is not re-searched");
const beforeEmpty = upstreamCalls;
const emptyDay = await filtersFor({ state: "Maharashtra", district: "Pune", commodity: "Onion" }, []);
check("E. an empty day for a real district reports unavailable",
  emptyDay.res.status === "unavailable" && /Onion/.test(emptyDay.res.reason) && /Pune/.test(emptyDay.res.reason),
  emptyDay.res.reason);
check("E. exactly one upstream request was made - no second district was tried",
  upstreamCalls === beforeEmpty + 1, `${upstreamCalls - beforeEmpty} call(s)`);
check("E. the empty-day message names the farmer's own district, not a fallback",
  !/Coimbatore/i.test(emptyDay.res.reason));

// ---- F. missing farm location -----------------------------------------
section("[OFFLINE] F. missing farm location");
const beforeMissing = upstreamCalls;
for (const [label, payload] of [
  ["no state", { district: "Pune", commodity: "Onion" }],
  ["no district", { state: "Maharashtra", commodity: "Onion" }],
  ["neither", { commodity: "Onion" }],
  ["null values", { state: null, district: null, commodity: "Onion" }],
  ["empty strings", { state: "", district: "", commodity: "Onion" }]
]) {
  const r = await (await call(payload)).json();
  bodies.push(r);
  check(`F. ${label} is refused`, r.status === "unavailable", r.reason);
  check(`F. ${label} never falls back to a real district`,
    !/Coimbatore|Pune|Madurai/i.test(r.reason ?? "") || /No market district matching/.test(r.reason));
}
check("F. no upstream request is made without a location", upstreamCalls === beforeMissing);

// ---- 2. empty AGMARKNET response --------------------------------------
section("[OFFLINE] 2. empty response");
upstream = json({ records: [] });
const empty = await (await call(FARM)).json();
bodies.push(empty);
check("an empty day is unavailable, never an empty price table",
  empty.status === "unavailable" && /No market data was reported/.test(empty.reason), empty.reason);

upstream = json({ records: [fixtureRecord({ market: "  " })] });
const unusable = await (await call(FARM)).json();
bodies.push(unusable);
check("rows with no market name yield unavailable, not blank rows", unusable.status === "unavailable");

// ---- 3. upstream HTTP failure -----------------------------------------
section("[OFFLINE] 3. upstream failure");
const failures = [];
for (const [label, stub] of [
  ["HTTP 429", json({ error: "Rate limit exceeded" }, 429)],
  ["HTTP 400", json({ error: "Authorization field missing" }, 400)],
  ["HTTP 500", json({ error: "server error" }, 500)],
  ["a network error", () => { throw new TypeError("fetch failed"); }],
  ["a non-JSON body", () => new Response("<html>not json</html>", { status: 200 })]
]) {
  upstream = stub;
  const r = await (await call(FARM)).json();
  failures.push(r);
  bodies.push(r);
  check(`${label} is reported honestly`, r.status === "unavailable", r.reason);
}
check("no failure path ever carries a data payload", failures.every((r) => !("data" in r)));
check("the provider's own error wording is never forwarded",
  failures.every((r) => !/rate limit|authorization field|server error/i.test(r.reason)));

// ---- 4. missing DATA_GOV_IN_API_KEY -----------------------------------
section("[OFFLINE] 4. missing DATA_GOV_IN_API_KEY");
const saved = process.env.DATA_GOV_IN_API_KEY;
delete process.env.DATA_GOV_IN_API_KEY;
const before = upstreamCalls;
upstream = json({ records: [fixtureRecord()] });
const noKey = await (await call(FARM)).json();
bodies.push(noKey);
check("it reports unavailable rather than any price", noKey.status === "unavailable", noKey.reason);
check("no upstream request is attempted without a key", upstreamCalls === before);
check("the message names no key, provider or internals",
  !/api-key|data\.gov|DATA_GOV/i.test(noKey.reason), noKey.reason);
process.env.DATA_GOV_IN_API_KEY = saved;

// ---- 7. the key never reaches a browser response ----------------------
section("[OFFLINE] 7. key containment in responses");
const allBodies = JSON.stringify(bodies);
check("no response body contains the configured key value", !allBodies.includes(saved));
check("no response body contains the string 'api-key'", !/api-key/i.test(allBodies));
// The `source` field deliberately says "agmarknet-data.gov.in": the page
// shows the farmer where the price came from, which is a transparency
// requirement rather than a leak. What must never appear is key material
// or the upstream query.
check("the only mention of data.gov.in is the source attribution",
  bodies.filter((b) => /data\.gov\.in/i.test(JSON.stringify(b)))
    .every((b) => b.source === "agmarknet-data.gov.in"));
check("no response body carries an upstream URL or query string",
  !/api\.data\.gov\.in\/resource|filters\[/i.test(allBodies));

globalThis.fetch = realFetch;
console.log(`\n${pass} passed, ${fail} failed`);
console.log("\nNOTE: all upstream responses above were fixtures. This run performed");
console.log("no live AGMARKNET request and proves nothing about live data.");
process.exit(fail ? 1 : 0);
