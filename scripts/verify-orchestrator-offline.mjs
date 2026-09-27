/**
 * OFFLINE verification of the built /api/orchestrator function.
 *
 * ────────────────────────────────────────────────────────────────────
 *  THIS IS NOT A LIVE TEST OF ANY AGENT.
 *
 *  Every external leg is stubbed — the Supabase token check, Open-Meteo
 *  and data.gov.in — so this runs with no API key, no account and no
 *  network. Schemes is not stubbed because it makes no network call at
 *  all; it runs for real against the curated catalog.
 *
 *  What this proves: the endpoint authenticates, gates each agent on
 *  readiness, isolates their failures from one another, holds the
 *  projection boundary, and still produces a briefing when agents are
 *  down.
 *
 *  What it does NOT prove: that Open-Meteo or data.gov.in return
 *  sensible data, or that either is reachable from Vercel.
 * ────────────────────────────────────────────────────────────────────
 *
 * Run `npm run build --workspace apps/web && npx vercel build --yes`
 * first, then `node scripts/verify-orchestrator-offline.mjs`.
 */

import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARTIFACT = path.join(REPO, ".vercel/output/functions/api/orchestrator.func/api/orchestrator.js");

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

/** A farm with everything filled in. Arbitrary values, not a demo farm. */
const FARM = {
  farmId: "farm-abc",
  state: "Punjab",
  district: "Ludhiana",
  latitude: 30.9,
  longitude: 75.8,
  areaAcres: 4,
  crops: ["Wheat"],
  primaryCrop: "Wheat",
  latestSoil: { testedOn: "2026-06-01" },
  recentScans: [],
  locale: "en"
};

// ---- stubs ------------------------------------------------------------
const realFetch = globalThis.fetch;
let weatherStub = null;
let marketStub = null;
const called = { weather: 0, market: 0, other: [] };

globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input.url;
  if (url.includes("/auth/v1/user")) {
    const auth = init?.headers?.Authorization ?? init?.headers?.authorization ?? "";
    const ok = auth === `Bearer ${VALID_TOKEN}`;
    return new Response(JSON.stringify(ok ? { id: "fixture-user" } : { error: "invalid" }), {
      status: ok ? 200 : 401,
      headers: { "content-type": "application/json" }
    });
  }
  if (url.includes("open-meteo.com")) {
    called.weather++;
    if (weatherStub) return weatherStub();
    throw new Error("offline: no weather fixture configured");
  }
  if (url.includes("data.gov.in")) {
    called.market++;
    if (marketStub) return marketStub();
    throw new Error("offline: no market fixture configured");
  }
  called.other.push(url);
  throw new Error(`offline: unexpected external call to ${url}`);
};

process.env.SUPABASE_URL ??= "https://offline.invalid";
process.env.SUPABASE_ANON_KEY ??= "offline-fixture-anon-key";
// A placeholder so the market path reaches the stub above. The
// "no API key configured" section deletes it deliberately, and nothing
// here ever contacts data.gov.in.
const FIXTURE_MARKET_KEY = "offline-fixture-key-not-a-real-credential";
process.env.DATA_GOV_IN_API_KEY = FIXTURE_MARKET_KEY;

const call = (body, tok = VALID_TOKEN, method = "POST") =>
  handler(new Request("https://example.test/api/orchestrator", {
    method,
    headers: { "content-type": "application/json", ...(tok ? { authorization: `Bearer ${tok}` } : {}) },
    ...(method === "POST" ? { body: JSON.stringify(body) } : {})
  }));

const json = (o, status = 200) => () =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });

/** A real Open-Meteo shape, trimmed to what the mapper reads. */
const weatherOk = (codes = [95]) => json({
  latitude: 30.9, longitude: 75.8, timezone: "Asia/Kolkata",
  current: { time: "2026-09-27T05:30", temperature_2m: 41, relative_humidity_2m: 40,
             precipitation: 0, weather_code: codes[0], wind_speed_10m: 35 },
  daily: { time: ["2026-09-27", "2026-09-28", "2026-09-29"], weather_code: codes,
           temperature_2m_max: [41, 42, 43], temperature_2m_min: [25, 25, 25],
           precipitation_sum: [15, 0, 0], precipitation_probability_max: [80, 10, 10] }
});
const marketOk = json({ records: [
  { state: "Punjab", district: "Ludhiana", market: "Mandi A", commodity: "Wheat",
    variety: "Local", grade: "FAQ", arrival_date: "27/09/2026",
    min_price: 1000, max_price: 1500, modal_price: 1000 },
  { state: "Punjab", district: "Ludhiana", market: "Mandi B", commodity: "Wheat",
    variety: "Local", grade: "FAQ", arrival_date: "27/09/2026",
    min_price: 1300, max_price: 1600, modal_price: 1400 }
] });

let pass = 0, fail = 0;
const check = (n, ok, d = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${n}${d ? " - " + d : ""}`); ok ? pass++ : fail++; };
const section = (s) => console.log(`\n${s}`);
const reset = () => { called.weather = 0; called.market = 0; called.other = []; };

console.log("OFFLINE endpoint checks - fixtures only, no network, no API key\n");
const bodies = [];

// ---- B. authentication -------------------------------------------------
section("[OFFLINE] B. authentication");
check("GET is rejected", (await call(FARM, VALID_TOKEN, "GET")).status === 405);
const noTok = await call(FARM, null);
bodies.push(await noTok.clone().json());
check("a request with no token is refused", noTok.status === 401, String(noTok.status));
const badTok = await call(FARM, "not-the-valid-token");
bodies.push(await badTok.clone().json());
check("a token Supabase rejects is refused", badTok.status === 401, String(badTok.status));
check("no agent ran for an unauthenticated caller", called.weather === 0 && called.market === 0);

// ---- A. an authenticated request --------------------------------------
section("[OFFLINE] A. an authenticated request with everything available");
reset();
weatherStub = weatherOk(); marketStub = marketOk;
const full = await (await call(FARM)).json();
bodies.push(full);
check("status ok", full.status === "ok", full.reason ?? "");
if (full.status === "ok") {
  check("weather signal ok", full.data.signals.weather.status === "ok");
  check("market signal ok", full.data.signals.market.status === "ok");
  check("schemes signal ok", full.data.signals.schemes.status === "ok");
  check("the briefing names the farm", full.data.farmId === "farm-abc");
  check("actions were produced", full.data.actions.length > 0, `${full.data.actions.length}`);
  check("disclaimer is a key, not prose", full.data.disclaimer === "decision.disclaimer");
}

// ---- C. readiness gates ------------------------------------------------
section("[OFFLINE] C. readiness gates");
reset();
weatherStub = weatherOk(); marketStub = marketOk;
const noCoords = await (await call({ ...FARM, latitude: null, longitude: null })).json();
bodies.push(noCoords);
check("no coordinates: weather is skipped, not failed",
  noCoords.data?.signals.weather.status === "skipped" &&
  noCoords.data?.signals.weather.reasonKey === "noCoordinates");
check("no coordinates: Open-Meteo was never called", called.weather === 0);
check("no coordinates: the farm-record rule says so",
  noCoords.data?.actions.some((a) => a.key === "farmLocationMissing"));

reset();
const noDistrict = await (await call({ ...FARM, district: null })).json();
bodies.push(noDistrict);
check("no district: market is skipped with noDistrict",
  noDistrict.data?.signals.market.status === "skipped" &&
  noDistrict.data?.signals.market.reasonKey === "noDistrict");
check("no district: data.gov.in was never called", called.market === 0);

reset();
const noCrop = await (await call({ ...FARM, crops: [], primaryCrop: null })).json();
bodies.push(noCrop);
check("no crop: market is skipped with noCrop",
  noCrop.data?.signals.market.status === "skipped" &&
  noCrop.data?.signals.market.reasonKey === "noCrop");
check("no crop: the farm-record rule says so",
  noCrop.data?.actions.some((a) => a.key === "noCropsRecorded"));

// ---- D, E, F, G. fan-out isolation -------------------------------------
section("[OFFLINE] D-G. one agent failing never costs the briefing");
reset();
weatherStub = weatherOk(); marketStub = json({ error: "nope" }, 500);
const d = await (await call(FARM)).json();
bodies.push(d);
check("D. weather ok + market down still briefs",
  d.status === "ok" && d.data.signals.weather.status === "ok" &&
  d.data.signals.market.status === "unavailable");
check("D. no market action is invented", !d.data?.actions.some((a) => a.sourceAgent === "market"));

reset();
weatherStub = json({ error: "nope" }, 503); marketStub = marketOk;
const e = await (await call(FARM)).json();
bodies.push(e);
check("E. weather down + market ok still briefs",
  e.status === "ok" && e.data.signals.weather.status === "unavailable" &&
  e.data.signals.market.status === "ok");
check("E. a market action is produced", e.data?.actions.some((a) => a.sourceAgent === "market"));

reset();
weatherStub = () => { throw new TypeError("fetch failed"); };
marketStub = () => { throw new TypeError("fetch failed"); };
const g = await (await call(FARM)).json();
bodies.push(g);
check("G. both upstreams throwing still briefs — allSettled, not all", g.status === "ok", g.reason ?? "");
check("G. both signals read unavailable",
  g.data?.signals.weather.status === "unavailable" && g.data?.signals.market.status === "unavailable");
check("G. schemes still succeeded", g.data?.signals.schemes.status === "ok");
check("G. nothing is fabricated",
  !JSON.stringify(g.data?.actions ?? []).match(/price|rain|temperature/i));

// ---- market unconfigured ----------------------------------------------
section("[OFFLINE] market with no API key configured");
reset();
delete process.env.DATA_GOV_IN_API_KEY;
weatherStub = weatherOk();
const noKey = await (await call(FARM)).json();
bodies.push(noKey);
check("the market signal is unavailable, never fabricated",
  noKey.data?.signals.market.status === "unavailable");
check("data.gov.in was never called without a key", called.market === 0);
check("the rest of the briefing is still produced",
  noKey.status === "ok" && noKey.data.signals.weather.status === "ok");
process.env.DATA_GOV_IN_API_KEY = FIXTURE_MARKET_KEY;

// ---- H, I. the projection boundary -------------------------------------
section("[OFFLINE] H-I. the projection boundary holds at the endpoint");
reset();
weatherStub = weatherOk(); marketStub = marketOk;
const leaky = await (await call({
  ...FARM,
  recentScans: [{
    scanId: "s1", cropName: "Wheat", createdAt: "2026-09-20T00:00:00.000Z",
    category: "disease", confidenceLevel: "high", recommendExpertConsult: true,
    label: "Tomato Early blight", primaryFinding: { label: "Tomato Early blight" }, disclaimer: "x"
  }],
  latestSoil: { testedOn: "2026-06-01", ph: 6.5, nitrogen: 240, phosphorus: 18, potassium: 160 }
})).json();
bodies.push(leaky);
const leakyJson = JSON.stringify(leaky);
check("H. no disease label reaches the response", !/blight/i.test(leakyJson));
check("I. no soil chemistry reaches the response",
  !/nitrogen|phosphorus|potassium|"ph"|6\.5|240/i.test(leakyJson));
check("the scan is still used for its permitted fields",
  leaky.data?.actions.some((a) => a.key === "recentDiagnosisNeedsExpert"));

// ---- contract ----------------------------------------------------------
section("[OFFLINE] the FarmBriefing contract");
const c = bodies.find((b) => b.status === "ok");
check("source names the orchestrator", c?.source === "agri-one-orchestrator", c?.source);
check("all six signals are always present",
  Object.keys(c?.data.signals ?? {}).sort().join(",") === "diagnosis,farm,market,schemes,soil,weather");
check("every signal has a status and a reasonKey field",
  Object.values(c?.data.signals ?? {}).every((s) => typeof s.status === "string" && "reasonKey" in s && "asOf" in s));
check("every action has key, priority and sourceAgent",
  (c?.data.actions ?? []).every((a) => a.key && a.priority && a.sourceAgent));

const bad = await (await call({ ...FARM, farmId: null })).json();
bodies.push(bad);
check("a request with no farm id is refused", bad.status === "unavailable", bad.reason);

// ---- no n8n, no secrets ------------------------------------------------
section("[OFFLINE] no n8n, no secrets");
check("the endpoint made no call outside Supabase, Open-Meteo and data.gov.in",
  called.other.length === 0, called.other.join(", "));
const all = JSON.stringify(bodies);
check("no response mentions n8n", !/n8n/i.test(all));
check("no response carries an api key", !/api-key|api_key/i.test(all));
check("no response carries a bearer token", !all.includes(VALID_TOKEN));
check("no response carries the market key", !all.includes(FIXTURE_MARKET_KEY));

globalThis.fetch = realFetch;
console.log(`\n${pass} passed, ${fail} failed`);
console.log("\nNOTE: every upstream response above was a fixture. This run performed");
console.log("no live Open-Meteo or data.gov.in request.");
process.exit(fail ? 1 : 0);
