/**
 * OFFLINE verification of the built /api/chat function.
 *
 * ────────────────────────────────────────────────────────────────────
 *  NOT a live test. Supabase, Open-Meteo and data.gov.in are all
 *  stubbed; Schemes runs for real because it makes no network call.
 *  No API key, no account, no network.
 *
 *  Proves: authentication, multilingual intent routing, that only the
 *  routed agent is consulted, that an unavailable agent yields an
 *  honest answer rather than a failure, and that the answer is always a
 *  key plus params — never prose in any language.
 * ────────────────────────────────────────────────────────────────────
 */

import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARTIFACT = path.join(REPO, ".vercel/output/functions/api/chat.func/api/chat.js");

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

const TOKEN = "offline-fixture-valid-token";
const FARM = {
  farmId: "farm-1", state: "Punjab", district: "Ludhiana",
  latitude: 30.9, longitude: 75.8, areaAcres: 4,
  crops: ["Wheat"], primaryCrop: "Wheat",
  latestSoil: { testedOn: "2026-06-01" }, recentScans: []
};

const realFetch = globalThis.fetch;
let weatherStub = null, marketStub = null;
const called = { weather: 0, market: 0, other: [] };
globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input.url;
  if (url.includes("/auth/v1/user")) {
    const a = init?.headers?.Authorization ?? init?.headers?.authorization ?? "";
    const ok = a === `Bearer ${TOKEN}`;
    return new Response(JSON.stringify(ok ? { id: "u" } : { error: "x" }), { status: ok ? 200 : 401 });
  }
  if (url.includes("open-meteo.com")) { called.weather++; return weatherStub ? weatherStub() : Promise.reject(new Error("no stub")); }
  if (url.includes("data.gov.in")) { called.market++; return marketStub ? marketStub() : Promise.reject(new Error("no stub")); }
  called.other.push(url);
  throw new Error(`offline: unexpected call to ${url}`);
};

process.env.SUPABASE_URL ??= "https://offline.invalid";
process.env.SUPABASE_ANON_KEY ??= "offline-fixture-anon-key";
const FIXTURE_KEY = "offline-fixture-key-not-a-real-credential";
process.env.DATA_GOV_IN_API_KEY = FIXTURE_KEY;

const json = (o, status = 200) => () =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
weatherStub = json({
  latitude: 30.9, longitude: 75.8, timezone: "Asia/Kolkata",
  current: { time: "2026-09-27T05:30", temperature_2m: 31, relative_humidity_2m: 60,
             precipitation: 0, weather_code: 1, wind_speed_10m: 10 },
  daily: { time: ["2026-09-27", "2026-09-28", "2026-09-29"], weather_code: [1, 1, 1],
           temperature_2m_max: [33, 34, 34], temperature_2m_min: [22, 22, 22],
           precipitation_sum: [0, 0, 0], precipitation_probability_max: [5, 5, 5] }
});
marketStub = json({ records: [
  { state: "Punjab", district: "Ludhiana", market: "Mandi A", commodity: "Wheat",
    variety: "Local", grade: "FAQ", arrival_date: "27/09/2026",
    min_price: 1000, max_price: 1500, modal_price: 1200 }
] });

const ask = (text, tok = TOKEN, method = "POST", extra = {}) =>
  handler(new Request("https://example.test/api/chat", {
    method,
    headers: { "content-type": "application/json", ...(tok ? { authorization: `Bearer ${tok}` } : {}) },
    ...(method === "POST" ? { body: JSON.stringify({ ...FARM, text, locale: "en", ...extra }) } : {})
  }));

let pass = 0, fail = 0;
const check = (n, ok, d = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${n}${d ? " - " + d : ""}`); ok ? pass++ : fail++; };
const section = (s) => console.log(`\n${s}`);
const reset = () => { called.weather = 0; called.market = 0; called.other = []; };

console.log("OFFLINE chat checks - fixtures only, no network, no API key\n");
const bodies = [];

section("[OFFLINE] authentication");
check("GET is rejected", (await ask("hi", TOKEN, "GET")).status === 405);
check("no token is refused", (await ask("hi", null)).status === 401);
check("an invalid token is refused", (await ask("hi", "nope")).status === 401);
check("no agent ran for an unauthenticated caller", called.weather === 0 && called.market === 0);

section("[OFFLINE] multilingual intent routing");
// Each question is in one language; the expected route must not depend
// on which language it was asked in.
const ROUTES = [
  ["en weather", "What is the weather today?", "weather.today"],
  ["ta weather", "இன்று வானிலை எப்படி?", "weather.today"],
  ["te weather", "ఈరోజు వాతావరణం ఎలా ఉంది?", "weather.today"],
  ["hi weather", "आज मौसम कैसा है?", "weather.today"],
  ["en market", "What is the price of Wheat?", "market.price"],
  ["ta market", "கோதுமை விலை என்ன?", "market.price"],
  ["te market", "గోధుమ ధర ఎంత?", "market.price"],
  ["hi market", "गेहूं का भाव क्या है?", "market.price"],
  ["en schemes", "Which government scheme can I apply for?", "schemes.list"],
  ["ta schemes", "எந்த அரசு திட்டம்?", "schemes.list"],
  ["te schemes", "ఏ ప్రభుత్వ పథకం?", "schemes.list"],
  ["hi schemes", "कौन सी सरकारी योजना?", "schemes.list"],
  ["en soil", "What is my soil pH?", "soil.status"],
  ["hi soil", "मिट्टी की स्थिति क्या है?", "soil.status"],
  ["en farm", "How big is my land?", "farm.info"],
  ["ta farm", "என் நிலம் எவ்வளவு?", "farm.info"],
  ["en briefing", "What should I do today?", "briefing.summary"],
  ["te briefing", "ఈరోజు ఏమి చేయాలి?", "briefing.summary"]
];
for (const [label, q, expected] of ROUTES) {
  reset();
  const r = await (await ask(q)).json();
  bodies.push(r);
  check(`${label} -> ${expected}`, r.status === "ok" && r.data.intent === expected,
    r.status === "ok" ? r.data.intent : r.reason);
}

section("[OFFLINE] only the routed agent is consulted");
reset();
await ask("What is the weather today?");
check("a weather question calls Open-Meteo and not data.gov.in",
  called.weather === 1 && called.market === 0, `w${called.weather} m${called.market}`);
reset();
await ask("What is the price of Wheat?");
check("a market question calls data.gov.in and not Open-Meteo",
  called.market === 1 && called.weather === 0, `w${called.weather} m${called.market}`);
reset();
await ask("Which scheme can I apply for?");
check("a schemes question calls neither upstream",
  called.weather === 0 && called.market === 0);
reset();
const soil = await (await ask("What is my soil status?")).json();
bodies.push(soil);
check("a local question calls no upstream at all",
  called.weather === 0 && called.market === 0);
check("chat never routes to Crop Diagnosis", called.other.length === 0);

section("[OFFLINE] an unavailable agent answers honestly");
reset();
weatherStub = json({ error: "down" }, 503);
const wdown = await (await ask("What is the weather today?")).json();
bodies.push(wdown);
check("a failing agent yields an answer, not a failure", wdown.status === "ok", wdown.reason ?? "");
check("the answer says the source was unavailable",
  wdown.data?.answerKey === "sourceUnavailable", wdown.data?.answerKey);
check("no weather value is fabricated",
  !JSON.stringify(wdown.data?.params ?? {}).match(/\d+(\.\d+)?\s*°|temperature/i));
weatherStub = json({
  latitude: 30.9, longitude: 75.8, timezone: "Asia/Kolkata",
  current: { time: "2026-09-27T05:30", temperature_2m: 31, relative_humidity_2m: 60,
             precipitation: 0, weather_code: 1, wind_speed_10m: 10 },
  daily: { time: ["2026-09-27"], weather_code: [1], temperature_2m_max: [33],
           temperature_2m_min: [22], precipitation_sum: [0], precipitation_probability_max: [5] }
});

reset();
delete process.env.DATA_GOV_IN_API_KEY;
const mNoKey = await (await ask("What is the price of Wheat?")).json();
bodies.push(mNoKey);
check("market with no key answers unavailable, never a price",
  mNoKey.status === "ok" && mNoKey.data.answerKey === "sourceUnavailable", mNoKey.data?.answerKey);
check("data.gov.in was never called without a key", called.market === 0);
process.env.DATA_GOV_IN_API_KEY = FIXTURE_KEY;

section("[OFFLINE] answers are keys, never prose");
const okBodies = bodies.filter((b) => b.status === "ok");
check("every answer carries an answerKey",
  okBodies.every((b) => typeof b.data.answerKey === "string" && b.data.answerKey.length > 0));
check("no answer contains a rendered sentence",
  okBodies.every((b) => !/ the | is | are |आज|இன்று|ఈరోజు/.test(JSON.stringify(b.data.answerKey))));
check("params are scalars only",
  okBodies.every((b) => b.data.params === null ||
    Object.values(b.data.params).every((v) => typeof v === "string" || typeof v === "number")));
check("source names the chat agent", okBodies.every((b) => b.source === "agri-one-chat"));

section("[OFFLINE] input validation and secrets");
const empty = await (await ask("   ")).json();
bodies.push(empty);
check("an empty question is refused", empty.status === "unavailable", empty.reason);
const all = JSON.stringify(bodies);
check("no response carries the market key", !all.includes(FIXTURE_KEY));
check("no response carries a bearer token", !all.includes(TOKEN));
check("no response mentions n8n", !/n8n/i.test(all));
check("no chemical or dose is ever emitted",
  !/pesticide|fungicide|insecticide|spray|dosage|kg\/ha/i.test(all));

globalThis.fetch = realFetch;
console.log(`\n${pass} passed, ${fail} failed`);
console.log("\nNOTE: all upstream responses were fixtures; no live request was made.");
process.exit(fail ? 1 : 0);
