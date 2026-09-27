import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RULE_KEYS,
  applyRules,
  type BriefingContext,
  type SignalBundle
} from "./decisionRules.ts";

/**
 * Every rule, fired and not fired.
 *
 * The rule table is the most safety-relevant code in this repo: it is
 * what a farmer actually reads. These assert both directions — that a
 * rule appears under its own trigger, and that it stays silent without
 * it — because a rule that fires unconditionally is as wrong as one
 * that never fires, and neither shows up in a happy-path test.
 */

const NOW = new Date("2026-09-27T00:00:00.000Z");

/** Everything filled in, so no farm-record rule fires by default. */
const COMPLETE: BriefingContext = {
  farmId: "farm-1",
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

const ctx = (over: Partial<BriefingContext> = {}): BriefingContext => ({ ...COMPLETE, ...over });
const weather = (advisories: string[]): SignalBundle => ({
  weather: { status: "ok", asOf: null, data: { advisories } }
});
const market = (quotes: unknown[], over: Record<string, unknown> = {}): SignalBundle => ({
  market: { status: "ok", asOf: null, data: { commodity: "Wheat", district: "Ludhiana", latestReportedOn: "2026-09-27", quotes, ...over } }
});
const schemes = (matched: number, skipped: number): SignalBundle => ({
  schemes: { status: "ok", asOf: null, data: { matches: Array.from({ length: matched }, () => ({ group: "matched" })), stateSchemesSkipped: skipped } }
});

const keys = (c: BriefingContext, s: SignalBundle) => applyRules(c, s, NOW).map((a) => a.key);
const fires = (k: string, c: BriefingContext, s: SignalBundle) => keys(c, s).includes(k);

// ------------------------------------------------------------ weather

const WEATHER_FLAGS: [string, string][] = [
  ["heavy_rain_expected", "heavyRainExpected"],
  ["thunderstorm_expected", "thunderstormExpected"],
  ["extreme_heat", "extremeHeat"],
  ["high_wind", "highWind"],
  ["no_rain_next_3_days", "noRainNext3Days"],
  ["rain_expected_today", "rainExpectedToday"]
];

for (const [flag, key] of WEATHER_FLAGS) {
  test(`${key} fires on its flag and on nothing else`, () => {
    assert.ok(fires(key, COMPLETE, weather([flag])), `${key} did not fire on ${flag}`);
    const others = WEATHER_FLAGS.filter(([f]) => f !== flag).map(([f]) => f);
    assert.ok(!fires(key, COMPLETE, weather(others)), `${key} fired without ${flag}`);
    assert.ok(!fires(key, COMPLETE, weather([])), `${key} fired with no flags`);
  });
}

test("no weather rule fires when the weather signal is unavailable", () => {
  const got = keys(COMPLETE, { weather: { status: "unavailable", reasonKey: "agentUnavailable" } });
  for (const [, key] of WEATHER_FLAGS) assert.ok(!got.includes(key), key);
});

test("no weather rule fires when the weather signal was skipped", () => {
  const got = keys(COMPLETE, { weather: { status: "skipped", reasonKey: "noCoordinates" } });
  for (const [, key] of WEATHER_FLAGS) assert.ok(!got.includes(key), key);
});

// ------------------------------------------------------------- market

const TWO_VENUES = [
  { market: "Mandi A", modalPrice: 1000, variety: "Local", grade: "FAQ" },
  { market: "Mandi B", modalPrice: 1400, variety: "Local", grade: "FAQ" }
];

test("marketPriceReportedVariety fires when the source named a variety", () => {
  assert.ok(fires("marketPriceReportedVariety", COMPLETE, market(TWO_VENUES)));
  assert.ok(!fires("marketPriceReported", COMPLETE, market(TWO_VENUES)));
});

test("marketPriceReported fires when the source named no variety", () => {
  const noVariety = [{ market: "Mandi A", modalPrice: 1000, variety: null, grade: null }];
  assert.ok(fires("marketPriceReported", COMPLETE, market(noVariety)));
  assert.ok(!fires("marketPriceReportedVariety", COMPLETE, market(noVariety)));
});

test("marketSpread fires only past the 15% threshold", () => {
  const at = [
    { market: "A", modalPrice: 1000, variety: null, grade: null },
    { market: "B", modalPrice: 1150, variety: null, grade: null }
  ];
  const below = [
    { market: "A", modalPrice: 1000, variety: null, grade: null },
    { market: "B", modalPrice: 1149, variety: null, grade: null }
  ];
  assert.ok(fires("marketSpread", COMPLETE, market(at)), "exactly 15% should fire");
  assert.ok(!fires("marketSpread", COMPLETE, market(below)), "just under 15% should not");
});

test("a spread is never reported across different varieties", () => {
  // Bellary at 4500 next to Onion Green at 8700 is not a 93% spread —
  // it is a different product.
  const mixed = [
    { market: "A", modalPrice: 4500, variety: "Bellary", grade: "FAQ" },
    { market: "B", modalPrice: 8700, variety: "Onion Green", grade: "FAQ" }
  ];
  assert.ok(!fires("marketSpread", COMPLETE, market(mixed)));
  assert.ok(!fires("marketSpreadVariety", COMPLETE, market(mixed)));
});

test("a single venue cannot have a spread", () => {
  const one = [{ market: "A", modalPrice: 1000, variety: "Local", grade: "FAQ" }];
  assert.ok(!fires("marketSpreadVariety", COMPLETE, market(one)));
});

test("no market rule fires when the market signal is unavailable", () => {
  const got = keys(COMPLETE, { market: { status: "unavailable", reasonKey: "agentUnavailable" } });
  for (const k of ["marketPriceReported", "marketPriceReportedVariety", "marketSpread", "marketSpreadVariety"]) {
    assert.ok(!got.includes(k), k);
  }
});

test("a quote with no price or no market name is never reported", () => {
  const junk = [{ market: "A", modalPrice: null }, { market: "", modalPrice: 1000 }];
  const got = keys(COMPLETE, market(junk));
  assert.ok(!got.some((k) => k.startsWith("market")));
});

// ---------------------------------------------------------- diagnosis

const scan = (over: Record<string, unknown> = {}) => ({
  scanId: "s1", cropName: "Wheat", createdAt: "2026-09-20T00:00:00.000Z",
  category: "disease", confidenceLevel: "medium", recommendExpertConsult: false, ...over
});

test("recentDiagnosisNeedsExpert fires only when the agent asked for an expert", () => {
  assert.ok(fires("recentDiagnosisNeedsExpert", ctx({ recentScans: [scan({ recommendExpertConsult: true })] }), {}));
  assert.ok(!fires("recentDiagnosisNeedsExpert", ctx({ recentScans: [scan()] }), {}));
  assert.ok(!fires("recentDiagnosisNeedsExpert", COMPLETE, {}));
});

test("recentDiagnosisInconclusive fires only for an inconclusive scan with no expert flag", () => {
  assert.ok(fires("recentDiagnosisInconclusive", ctx({ recentScans: [scan({ category: "inconclusive" })] }), {}));
  // An expert request takes precedence; the scan is not also reported as inconclusive.
  assert.ok(!fires("recentDiagnosisInconclusive",
    ctx({ recentScans: [scan({ category: "inconclusive", recommendExpertConsult: true })] }), {}));
  assert.ok(!fires("recentDiagnosisInconclusive", ctx({ recentScans: [scan({ category: "disease" })] }), {}));
});

test("a scan older than 30 days is outside the window", () => {
  const old = scan({ recommendExpertConsult: true, createdAt: "2026-08-01T00:00:00.000Z" });
  assert.ok(!fires("recentDiagnosisNeedsExpert", ctx({ recentScans: [old] }), {}));
});

// ------------------------------------------------------------ schemes

test("schemesMatched fires only when something matched", () => {
  assert.ok(fires("schemesMatched", COMPLETE, schemes(2, 0)));
  assert.ok(!fires("schemesMatched", COMPLETE, schemes(0, 0)));
});

test("schemesStateUnknown fires only when state schemes were skipped", () => {
  assert.ok(fires("schemesStateUnknown", COMPLETE, schemes(1, 4)));
  assert.ok(!fires("schemesStateUnknown", COMPLETE, schemes(1, 0)));
});

// --------------------------------------------------------------- soil

test("soilDataMissing fires only with no soil record", () => {
  assert.ok(fires("soilDataMissing", ctx({ latestSoil: null }), {}));
  assert.ok(!fires("soilDataMissing", COMPLETE, {}));
});

test("soilDataStale fires only past a year", () => {
  assert.ok(fires("soilDataStale", ctx({ latestSoil: { testedOn: "2025-09-01" } }), {}));
  assert.ok(!fires("soilDataStale", ctx({ latestSoil: { testedOn: "2026-06-01" } }), {}));
  // A stale record is not also a missing one.
  assert.ok(!fires("soilDataMissing", ctx({ latestSoil: { testedOn: "2025-09-01" } }), {}));
});

// -------------------------------------------------------- farm record

test("farmLocationMissing fires only without coordinates", () => {
  assert.ok(fires("farmLocationMissing", ctx({ latitude: null, longitude: null }), {}));
  assert.ok(fires("farmLocationMissing", ctx({ longitude: null }), {}));
  assert.ok(!fires("farmLocationMissing", COMPLETE, {}));
});

test("farmDistrictMissing fires only without a state or district", () => {
  assert.ok(fires("farmDistrictMissing", ctx({ district: null }), {}));
  assert.ok(fires("farmDistrictMissing", ctx({ state: null }), {}));
  assert.ok(!fires("farmDistrictMissing", COMPLETE, {}));
});

test("noCropsRecorded fires only with no crops", () => {
  assert.ok(fires("noCropsRecorded", ctx({ crops: [] }), {}));
  assert.ok(!fires("noCropsRecorded", COMPLETE, {}));
});

// ------------------------------------------------------- the whole set

test("a complete farm with no signals emits nothing at all", () => {
  assert.deepEqual(keys(COMPLETE, {}), []);
});

test("every emitted key is declared in RULE_KEYS", () => {
  const all = keys(
    ctx({ latitude: null, longitude: null, district: null, crops: [], latestSoil: null,
          recentScans: [scan({ recommendExpertConsult: true }), scan({ scanId: "s2", category: "inconclusive" })] }),
    { ...weather(WEATHER_FLAGS.map(([f]) => f)), ...market(TWO_VENUES), ...schemes(2, 3) }
  );
  for (const k of all) assert.ok(RULE_KEYS.includes(k as (typeof RULE_KEYS)[number]), `undeclared key ${k}`);
});

test("every rule emits a sourceAgent and a priority", () => {
  const actions = applyRules(
    ctx({ latitude: null, crops: [], latestSoil: null }),
    { ...weather(["extreme_heat"]), ...schemes(1, 1) },
    NOW
  );
  for (const a of actions) {
    assert.ok(["weather", "market", "schemes", "diagnosis", "soil", "farm"].includes(a.sourceAgent), a.key);
    assert.ok(["high", "medium", "low"].includes(a.priority), a.key);
  }
});

test("no rule can emit a chemical, product or dose", () => {
  const BANNED = /pesticide|insecticide|fungicide|herbicide|spray|dosage|kg\/ha|ml\/l|apply |treat /i;
  const actions = applyRules(
    ctx({ latitude: null, district: null, crops: [], latestSoil: null,
          recentScans: [scan({ recommendExpertConsult: true })] }),
    { ...weather(WEATHER_FLAGS.map(([f]) => f)), ...market(TWO_VENUES), ...schemes(2, 3) },
    NOW
  );
  assert.ok(!BANNED.test(JSON.stringify(actions)));
});
