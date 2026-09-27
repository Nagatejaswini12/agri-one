import { test } from "node:test";
import assert from "node:assert/strict";
import type { DataResult, FarmBriefing } from "@agri-one/shared-types";
import { buildAgentInputs, orchestrate, toSignal } from "./orchestrate.ts";
import {
  RULE_KEYS,
  applyRules,
  briefingUnavailable,
  buildBriefing,
  groupComparableQuotes,
  isUsable
} from "./decisionRules.ts";

/**
 * These pin the Orchestrator that moved out of n8n.
 *
 * Two properties matter more than the rest. One dead agent must never
 * cost the farmer the whole briefing — that is why the fan-out uses
 * allSettled, and several tests below exist only to stop someone
 * "simplifying" it to Promise.all. And the projection boundary must
 * hold: no disease label and no soil chemistry may reach a rule, which
 * is what makes "turn a diagnosis into a treatment" impossible rather
 * than merely forbidden.
 */

const NOW = new Date("2026-09-27T00:00:00.000Z");
const FIXED = () => NOW;
const RULES = { applyRules, buildBriefing, briefingUnavailable, isUsable };

/** A farm with everything filled in. Values are arbitrary, not a demo farm. */
const FULL = {
  farmId: "farm-1",
  state: "Karnataka",
  district: "Bidar",
  latitude: 17.9,
  longitude: 77.5,
  areaAcres: 3,
  crops: ["Onion", "Wheat"],
  primaryCrop: "Onion",
  latestSoil: { testedOn: "2026-06-01" },
  recentScans: [
    { scanId: "s1", cropName: "Onion", createdAt: "2026-09-20T10:00:00.000Z", category: "disease", confidenceLevel: "medium", recommendExpertConsult: true }
  ],
  locale: "en"
};

const okWeather = (advisories: string[] = []): DataResult<unknown> => ({
  status: "ok", asOf: "2026-09-27T00:00:00.000Z", source: "open-meteo",
  data: { advisories, current: {}, forecast: [] }
});
const okMarket = (quotes: unknown[]): DataResult<unknown> => ({
  status: "ok", asOf: "2026-09-27T00:00:00.000Z", source: "agmarknet-data.gov.in",
  data: { commodity: "Onion", district: "Bidar", latestReportedOn: "2026-09-27", quotes }
});
const okSchemes = (matched: number, skipped: number): DataResult<unknown> => ({
  status: "ok", asOf: "2026-09-27T00:00:00.000Z", source: "agri-one-curated-scheme-catalog",
  data: { matches: Array.from({ length: matched }, () => ({ group: "matched" })), stateSchemesSkipped: skipped }
});
const down: DataResult<unknown> = { status: "unavailable", reason: "service down" };

const agents = (w: unknown, m: unknown, s: unknown) => ({
  weather: async () => { if (w instanceof Error) throw w; return w as DataResult<unknown>; },
  market: async () => { if (m instanceof Error) throw m; return m as DataResult<unknown>; },
  schemes: async () => { if (s instanceof Error) throw s; return s as DataResult<unknown>; }
});

const ok = (r: DataResult<unknown>): { status: "ok"; asOf: string; source: string; data: FarmBriefing } => {
  assert.equal(r.status, "ok", r.status === "unavailable" ? r.reason : "");
  if (r.status !== "ok") throw new Error("unreachable");
  return r as { status: "ok"; asOf: string; source: string; data: FarmBriefing };
};

// ------------------------------------------------ H, I. the projection

test("H. a disease label never survives into the context", () => {
  const { context } = buildAgentInputs({
    ...FULL,
    recentScans: [{
      scanId: "s1", cropName: "Onion", createdAt: "2026-09-20T10:00:00.000Z",
      category: "disease", confidenceLevel: "high", recommendExpertConsult: true,
      // A caller sending these must not get them through.
      label: "Tomato Early blight", primaryFinding: { label: "Tomato Early blight" },
      alternativePossibilities: [{ label: "Late blight" }], disclaimer: "..."
    }]
  });
  const json = JSON.stringify(context);
  assert.ok(!/blight/i.test(json), "a disease label reached the context");
  assert.ok(!/alternativePossibilities|disclaimer|primaryFinding/.test(json));
  assert.deepEqual(Object.keys(context.recentScans[0]).sort(),
    ["category", "confidenceLevel", "createdAt", "cropName", "recommendExpertConsult", "scanId"].sort());
});

test("I. soil chemistry never survives into the context", () => {
  const { context } = buildAgentInputs({
    ...FULL,
    latestSoil: { testedOn: "2026-06-01", ph: 6.5, nitrogen: 240, phosphorus: 18, potassium: 160, organicCarbon: 0.58, soilType: "loamy" }
  });
  assert.deepEqual(context.latestSoil, { testedOn: "2026-06-01" });
  const json = JSON.stringify(context);
  for (const leaked of ["ph", "nitrogen", "phosphorus", "potassium", "organicCarbon", "soilType", "6.5", "240"]) {
    assert.ok(!json.includes(leaked), `${leaked} reached the context`);
  }
});

test("no rule output can contain a disease label or a soil value", () => {
  const { context } = buildAgentInputs(FULL);
  const actions = applyRules(context, { weather: { status: "ok", asOf: null, data: { advisories: ["extreme_heat"] } } }, NOW);
  const json = JSON.stringify(actions);
  assert.ok(!/blight|mite|6\.5|nitrogen/i.test(json));
});

// ------------------------------------------------- C. readiness gates

test("C. weather is gated on coordinates", () => {
  assert.equal(buildAgentInputs(FULL).readiness.weatherReady, true);
  const no = buildAgentInputs({ ...FULL, latitude: null, longitude: null }).readiness;
  assert.equal(no.weatherReady, false);
  assert.equal(no.weatherSkipReason, "noCoordinates");
  assert.equal(buildAgentInputs({ ...FULL, longitude: null }).readiness.weatherReady, false);
});

test("C. market is gated on state, district and a crop", () => {
  assert.equal(buildAgentInputs(FULL).readiness.marketReady, true);
  assert.equal(buildAgentInputs({ ...FULL, district: null }).readiness.marketSkipReason, "noDistrict");
  assert.equal(buildAgentInputs({ ...FULL, state: null }).readiness.marketSkipReason, "noDistrict");
  const noCrop = buildAgentInputs({ ...FULL, crops: [], primaryCrop: null }).readiness;
  assert.equal(noCrop.marketReady, false);
  assert.equal(noCrop.marketSkipReason, "noCrop");
});

test("C. a gated agent is never called", async () => {
  let called = false;
  const r = await orchestrate(
    { ...FULL, latitude: null, longitude: null },
    { ...agents(okWeather(), okMarket([]), okSchemes(1, 0)), weather: async () => { called = true; return okWeather(); } },
    RULES, FIXED
  );
  assert.equal(called, false, "weather was called despite having no coordinates");
  assert.equal(ok(r).data.signals.weather.status, "skipped");
  assert.equal(ok(r).data.signals.weather.reasonKey, "noCoordinates");
});

test("primaryCrop falls back to the first recorded crop", () => {
  assert.equal(buildAgentInputs({ ...FULL, primaryCrop: null }).context.primaryCrop, "Onion");
});

// --------------------------------------------- D, E, F, G. the fan-out

test("D. weather ok + market unavailable + schemes ok still briefs", async () => {
  const r = ok(await orchestrate(FULL, agents(okWeather(["extreme_heat"]), down, okSchemes(2, 0)), RULES, FIXED));
  assert.equal(r.data.signals.weather.status, "ok");
  assert.equal(r.data.signals.market.status, "unavailable");
  assert.equal(r.data.signals.schemes.status, "ok");
  assert.ok(r.data.actions.some((a) => a.key === "extremeHeat"));
  assert.ok(r.data.actions.some((a) => a.key === "schemesMatched"));
  assert.ok(!r.data.actions.some((a) => a.sourceAgent === "market"));
});

test("E. weather unavailable + market ok + schemes ok still briefs", async () => {
  const r = ok(await orchestrate(FULL, agents(down, okMarket([
    { market: "A", modalPrice: 1000, variety: "Local", grade: "FAQ" },
    { market: "B", modalPrice: 2000, variety: "Local", grade: "FAQ" }
  ]), okSchemes(1, 0)), RULES, FIXED));
  assert.equal(r.data.signals.weather.status, "unavailable");
  assert.equal(r.data.signals.market.status, "ok");
  assert.ok(r.data.actions.some((a) => a.sourceAgent === "market"));
  assert.ok(!r.data.actions.some((a) => a.sourceAgent === "weather"));
});

test("F. an agent that THROWS still leaves a briefing — allSettled, not all", async () => {
  // If this is ever changed to Promise.all, the whole briefing rejects
  // and the farmer gets a blank dashboard.
  const r = ok(await orchestrate(FULL, agents(new Error("boom"), okMarket([]), okSchemes(1, 0)), RULES, FIXED));
  assert.equal(r.data.signals.weather.status, "unavailable");
  assert.equal(r.data.signals.schemes.status, "ok");
  assert.ok(r.data.actions.length > 0);
});

test("F. every single-agent failure still produces a briefing", async () => {
  for (const [name, w, m, s] of [
    ["weather", down, okMarket([]), okSchemes(1, 0)],
    ["market", okWeather(), down, okSchemes(1, 0)],
    ["schemes", okWeather(), okMarket([]), down]
  ] as const) {
    const r = await orchestrate(FULL, agents(w, m, s), RULES, FIXED);
    assert.equal(r.status, "ok", `${name} down should still brief`);
  }
});

test("G. all three agents down still produces a briefing, not a blank page", async () => {
  const r = ok(await orchestrate(FULL, agents(down, down, down), RULES, FIXED));
  for (const a of ["weather", "market", "schemes"] as const) {
    assert.equal(r.data.signals[a].status, "unavailable", a);
    assert.equal(r.data.signals[a].reasonKey, "agentUnavailable");
  }
  // The farm-record and soil rules still have something true to say.
  assert.ok(r.data.actions.length > 0);
  assert.ok(r.data.actions.every((a) => !["weather", "market", "schemes"].includes(a.sourceAgent)));
});

test("nothing is fabricated when a signal is unavailable", async () => {
  const r = ok(await orchestrate(FULL, agents(down, down, down), RULES, FIXED));
  const json = JSON.stringify(r.data.actions);
  assert.ok(!/price|rain|scheme/i.test(json), "an unavailable agent produced content");
});

// ------------------------------------------------- signal state model

test("the four signal states stay distinguishable", async () => {
  const r = ok(await orchestrate(
    { ...FULL, latitude: null, longitude: null },
    agents(okWeather(), down, okSchemes(0, 3)), RULES, FIXED
  ));
  assert.equal(r.data.signals.weather.status, "skipped", "readiness-gated");
  assert.equal(r.data.signals.market.status, "unavailable", "failed");
  assert.equal(r.data.signals.schemes.status, "ok", "available");
  assert.equal(r.data.signals.diagnosis.status, "ok", "from the farmer's own records");
  assert.equal(r.data.signals.soil.status, "ok");
  assert.equal(r.data.signals.farm.status, "ok");
});

test("diagnosis and soil report the farmer's records, not a service", async () => {
  const r = ok(await orchestrate(
    { ...FULL, recentScans: [], latestSoil: null },
    agents(okWeather(), okMarket([]), okSchemes(1, 0)), RULES, FIXED
  ));
  assert.equal(r.data.signals.diagnosis.status, "skipped");
  assert.equal(r.data.signals.diagnosis.reasonKey, "noRecentScans");
  assert.equal(r.data.signals.soil.status, "skipped");
  assert.equal(r.data.signals.soil.reasonKey, "noSoilRecord");
});

test("toSignal maps each outcome", () => {
  assert.equal(toSignal(null, "noCoordinates").status, "skipped");
  assert.equal(toSignal(null, null).status, "unavailable");
  assert.equal(toSignal({ status: "unavailable", reason: "x" }, null).status, "unavailable");
  assert.equal(toSignal({ status: "ok", asOf: "t", source: "s", data: {} }, null).status, "ok");
});

// ------------------------------------------------------ A, B. contract

test("A/L. the response matches the FarmBriefing contract the UI renders", async () => {
  const r = ok(await orchestrate(FULL, agents(okWeather(["high_wind"]), okMarket([]), okSchemes(1, 2)), RULES, FIXED));
  assert.equal(r.source, "agri-one-orchestrator");
  assert.equal(r.data.farmId, "farm-1");
  assert.equal(r.data.generatedAt, NOW.toISOString());
  assert.equal(r.data.primaryCrop, "Onion");
  assert.equal(r.data.disclaimer, "decision.disclaimer");
  assert.deepEqual(Object.keys(r.data.signals).sort(),
    ["diagnosis", "farm", "market", "schemes", "soil", "weather"]);
  for (const a of r.data.actions) {
    assert.ok(RULE_KEYS.includes(a.key as (typeof RULE_KEYS)[number]), `unknown key ${a.key}`);
    assert.ok(["high", "medium", "low"].includes(a.priority));
    assert.ok(a.params === null || typeof a.params === "object");
  }
});

test("B. a request with no farm id cannot be briefed", async () => {
  const r = await orchestrate({ ...FULL, farmId: null }, agents(okWeather(), okMarket([]), okSchemes(1, 0)), RULES, FIXED);
  assert.equal(r.status, "unavailable");
  if (r.status !== "unavailable") return;
  assert.match(r.reason, /could not be prepared/i);
});

test("actions sort by priority then declaration order", async () => {
  const r = ok(await orchestrate(
    { ...FULL, latestSoil: null },
    agents(okWeather(["rain_expected_today", "extreme_heat"]), okMarket([]), okSchemes(1, 0)), RULES, FIXED
  ));
  const order = { high: 0, medium: 1, low: 2 } as const;
  const got = r.data.actions.map((a) => order[a.priority]);
  assert.deepEqual(got, [...got].sort((a, b) => a - b), "priorities are out of order");
});

test("groupComparableQuotes never compares different varieties", () => {
  const groups = groupComparableQuotes([
    { market: "A", modalPrice: 4500, variety: "Bellary", grade: "FAQ" },
    { market: "B", modalPrice: 8700, variety: "Onion Green", grade: "FAQ" },
    { market: "C", modalPrice: 4700, variety: "Bellary", grade: "FAQ" }
  ]);
  assert.equal(groups.length, 2);
  assert.equal(groups.find((g) => g.variety === "Bellary")?.quotes.length, 2);
});
