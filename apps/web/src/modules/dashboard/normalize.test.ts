import assert from "node:assert/strict";
import test from "node:test";
import type { DataResult } from "@agri-one/shared-types";
import { normalizeBriefingResult } from "./normalize.ts";

/**
 * Run with `npm run test -w @agri-one/web`.
 *
 * The Orchestrator lives in n8n and can change without this codebase
 * noticing. The load-bearing assertions here are the two that stop the
 * briefing reading as more confident or more complete than it is: every
 * action must be attributable, and every agent must appear in `signals`
 * whether or not it answered.
 */

const action = {
  key: "heavyRainExpected",
  params: null,
  priority: "high",
  sourceAgent: "weather"
};

function ok(data: unknown): DataResult<unknown> {
  return {
    status: "ok",
    asOf: "2026-09-21T17:00:00.000Z",
    source: "agri-one-orchestrator",
    data
  };
}

function briefing(over: Record<string, unknown> = {}) {
  return ok({
    farmId: "farm-1",
    generatedAt: "2026-09-21T17:00:00.000Z",
    primaryCrop: "Tomato",
    signals: {
      weather: { status: "ok", reasonKey: null, asOf: "2026-09-21T17:00:00.000Z" },
      market: { status: "ok", reasonKey: null, asOf: "2026-09-21T17:00:01.000Z" },
      schemes: { status: "ok", reasonKey: null, asOf: null },
      diagnosis: { status: "skipped", reasonKey: "noRecentScans", asOf: null },
      soil: { status: "skipped", reasonKey: "noSoilRecord", asOf: null },
      farm: { status: "ok", reasonKey: null, asOf: null }
    },
    actions: [action],
    disclaimer: "decision.disclaimer",
    ...over
  });
}

test("passes a well-formed briefing through unchanged", () => {
  const r = normalizeBriefingResult(briefing());
  assert.equal(r.status, "ok");
  if (r.status !== "ok") return;
  assert.equal(r.data.farmId, "farm-1");
  assert.equal(r.data.primaryCrop, "Tomato");
  assert.equal(r.data.actions.length, 1);
  assert.equal(r.data.signals.weather.status, "ok");
  assert.equal(r.data.signals.soil.reasonKey, "noSoilRecord");
});

test("an action with no sourceAgent is dropped", () => {
  for (const broken of [
    { ...action, sourceAgent: undefined },
    { ...action, sourceAgent: "" },
    { ...action, sourceAgent: "llm" },
    { ...action, key: "" },
    { ...action, priority: "urgent" },
    { ...action, priority: undefined },
    "not an object",
    null
  ]) {
    const r = normalizeBriefingResult(briefing({ actions: [broken] }));
    assert.equal(r.status, "ok");
    if (r.status !== "ok") return;
    assert.equal(r.data.actions.length, 0, `should drop ${JSON.stringify(broken).slice(0, 40)}`);
  }
});

test("every agent appears in signals even when the payload omits it", () => {
  const r = normalizeBriefingResult(briefing({ signals: { weather: { status: "ok" } } }));
  assert.equal(r.status, "ok");
  if (r.status !== "ok") return;
  for (const agent of ["weather", "market", "schemes", "diagnosis", "soil", "farm"] as const) {
    assert.ok(r.data.signals[agent], `${agent} missing`);
  }
  // A signal the Orchestrator never mentioned must not read as healthy.
  assert.equal(r.data.signals.market.status, "unavailable");
  assert.equal(r.data.signals.market.reasonKey, "notConsulted");
});

test("an unrecognised signal status degrades to unavailable, never ok", () => {
  const r = normalizeBriefingResult(
    briefing({ signals: { weather: { status: "probably_fine", reasonKey: null } } })
  );
  assert.equal(r.status, "ok");
  if (r.status !== "ok") return;
  assert.equal(r.data.signals.weather.status, "unavailable");
});

test("a non-ok signal always carries a reason the UI can render", () => {
  const r = normalizeBriefingResult(
    briefing({ signals: { market: { status: "unavailable", reasonKey: null } } })
  );
  assert.equal(r.status, "ok");
  if (r.status !== "ok") return;
  assert.equal(r.data.signals.market.reasonKey, "agentUnavailable");
});

test("an ok signal carries no reason", () => {
  const r = normalizeBriefingResult(
    briefing({ signals: { weather: { status: "ok", reasonKey: "leftover" } } })
  );
  assert.equal(r.status, "ok");
  if (r.status !== "ok") return;
  assert.equal(r.data.signals.weather.reasonKey, null);
});

test("zero actions is a valid briefing, not an error", () => {
  const r = normalizeBriefingResult(briefing({ actions: [] }));
  assert.equal(r.status, "ok");
  if (r.status !== "ok") return;
  assert.equal(r.data.actions.length, 0);
});

test("a briefing with no farmId is unusable", () => {
  const r = normalizeBriefingResult(briefing({ farmId: "  " }));
  assert.equal(r.status, "unavailable");
});

test("action params keep only renderable scalars", () => {
  const r = normalizeBriefingResult(
    briefing({
      actions: [{ ...action, key: "marketSpread", sourceAgent: "market", params: { crop: "Tomato", low: 2500, junk: { a: 1 } } }]
    })
  );
  assert.equal(r.status, "ok");
  if (r.status !== "ok") return;
  assert.deepEqual(r.data.actions[0].params, { crop: "Tomato", low: 2500 });
});

test("keeps the agent's own unavailable reason", () => {
  const r = normalizeBriefingResult({
    status: "unavailable",
    reason: "Your farm briefing could not be prepared right now."
  });
  assert.equal(r.status, "unavailable");
  if (r.status !== "unavailable") return;
  assert.match(r.reason, /could not be prepared/);
});

test("supplies a reason when the agent sent an empty one", () => {
  const r = normalizeBriefingResult({ status: "unavailable", reason: "" });
  assert.equal(r.status, "unavailable");
  if (r.status !== "unavailable") return;
  assert.ok(r.reason.length > 0);
});

test("a non-object payload is unavailable, not a crash", () => {
  for (const junk of [null, "text", 42, []]) {
    assert.equal(normalizeBriefingResult(ok(junk)).status, "unavailable");
  }
});

test("no undefined or NaN reaches the rendered shape", () => {
  const r = normalizeBriefingResult(briefing());
  assert.equal(r.status, "ok");
  if (r.status !== "ok") return;
  const s = JSON.stringify(r.data);
  assert.ok(!s.includes("undefined"));
  assert.ok(!s.includes("NaN"));
});
