import assert from "node:assert/strict";
import test from "node:test";
import type { DataResult } from "@agri-one/shared-types";
import { normalizeSchemesResult } from "./normalize.ts";

/**
 * Run with `npm run test -w @agri-one/web`.
 *
 * The agent lives in n8n and can change without this codebase noticing,
 * so these cover what it can actually emit. The load-bearing ones are the
 * invariants that stop the page reading as an eligibility verdict.
 */

const scheme = {
  id: "pm-kisan",
  name: "Pradhan Mantri Kisan Samman Nidhi (PM-KISAN)",
  level: "central",
  states: [],
  purpose: "Income support for landholding farmer families.",
  benefit: "Rs 6,000 per year in three instalments of Rs 2,000.",
  appliesToCrops: [],
  sourceName: "PM-KISAN portal",
  sourceUrl: "https://pmkisan.gov.in/",
  lastVerifiedOn: "2026-09-21"
};

const match = {
  scheme,
  group: "matched",
  criteria: [
    { key: "landRecorded", status: "matched", params: { acres: 2 } },
    { key: "landOwnership", status: "cannot_check", params: null }
  ],
  stale: false
};

function ok(data: unknown): DataResult<unknown> {
  return {
    status: "ok",
    asOf: "2026-09-21T15:00:00.000Z",
    source: "agri-one-curated-scheme-catalog",
    data
  };
}

function result(matches: unknown[], extra: Record<string, unknown> = {}) {
  return ok({
    state: "Tamil Nadu",
    district: "Thiruvallur",
    askedState: "tamilnadu",
    stateSchemesSkipped: 0,
    totalSchemes: 10,
    catalogVersion: "2026-09-21",
    catalogVerifiedOn: "2026-09-21",
    matches,
    ...extra
  });
}

test("passes a well-formed match through unchanged", () => {
  const r = normalizeSchemesResult(result([match]));
  assert.equal(r.status, "ok");
  if (r.status !== "ok") return;
  assert.equal(r.data.state, "Tamil Nadu");
  assert.equal(r.data.matches.length, 1);
  assert.equal(r.data.matches[0].scheme.id, "pm-kisan");
  assert.equal(r.data.matches[0].criteria[0].params?.acres, 2);
});

test("a malformed catalog entry is dropped, not half-rendered", () => {
  for (const broken of [
    { ...scheme, name: "   " },
    { ...scheme, id: "" },
    { ...scheme, sourceUrl: "" },
    { ...scheme, sourceName: "" },
    { ...scheme, level: "district" },
    { ...scheme, sourceUrl: "http://pmkisan.gov.in/" },
    { ...scheme, sourceUrl: "/schemes/pm-kisan" },
    "not an object",
    null
  ]) {
    const r = normalizeSchemesResult(result([{ ...match, scheme: broken }]));
    assert.equal(r.status, "unavailable", `should drop ${JSON.stringify(broken).slice(0, 40)}`);
  }
});

test("every scheme keeps at least one criterion the farmer must verify", () => {
  // A scheme with nothing left to check would read as a guarantee, so it
  // is dropped rather than shown.
  const allChecked = {
    ...match,
    criteria: [{ key: "landRecorded", status: "matched", params: null }]
  };
  const r = normalizeSchemesResult(result([allChecked]));
  assert.equal(r.status, "unavailable");

  const kept = normalizeSchemesResult(result([match]));
  assert.equal(kept.status, "ok");
  if (kept.status !== "ok") return;
  assert.ok(kept.data.matches[0].criteria.some((c) => c.status === "cannot_check"));
});

test("an unrecognised criterion status degrades to cannot_check, never a pass", () => {
  const r = normalizeSchemesResult(
    result([
      {
        ...match,
        criteria: [
          { key: "landRecorded", status: "definitely_eligible", params: null },
          { key: "landOwnership", status: "cannot_check", params: null }
        ]
      }
    ])
  );
  assert.equal(r.status, "ok");
  if (r.status !== "ok") return;
  assert.equal(r.data.matches[0].criteria[0].status, "cannot_check");
});

test("an unrecognised group falls back to needs_check, not matched", () => {
  const r = normalizeSchemesResult(result([{ ...match, group: "eligible" }]));
  assert.equal(r.status, "ok");
  if (r.status !== "ok") return;
  assert.equal(r.data.matches[0].group, "needs_check");
});

test("unknown staleness is treated as stale", () => {
  const r = normalizeSchemesResult(result([{ ...match, stale: "maybe" }]));
  assert.equal(r.status, "ok");
  if (r.status !== "ok") return;
  assert.equal(r.data.matches[0].stale, true);
});

test("an unparseable verified date becomes null instead of today", () => {
  const r = normalizeSchemesResult(
    result([{ ...match, scheme: { ...scheme, lastVerifiedOn: "21/09/2026" } }], {
      catalogVerifiedOn: "2026-13-45"
    })
  );
  assert.equal(r.status, "ok");
  if (r.status !== "ok") return;
  assert.equal(r.data.matches[0].scheme.lastVerifiedOn, null);
  assert.equal(r.data.catalogVerifiedOn, null);
});

test("stateSchemesSkipped is preserved so the page can explain the gap", () => {
  const r = normalizeSchemesResult(
    ok({
      state: null,
      district: null,
      askedState: null,
      stateSchemesSkipped: 4,
      totalSchemes: 10,
      catalogVersion: "2026-09-21",
      catalogVerifiedOn: "2026-09-21",
      matches: [match]
    })
  );
  assert.equal(r.status, "ok");
  if (r.status !== "ok") return;
  assert.equal(r.data.stateSchemesSkipped, 4);
  assert.equal(r.data.state, null);
});

test("a missing stateSchemesSkipped counts as zero, not NaN", () => {
  const r = normalizeSchemesResult(
    ok({ state: "Tamil Nadu", matches: [match], totalSchemes: 10 })
  );
  assert.equal(r.status, "ok");
  if (r.status !== "ok") return;
  assert.equal(r.data.stateSchemesSkipped, 0);
  assert.ok(Number.isFinite(r.data.totalSchemes));
});

test("empty catalog becomes unavailable, not an empty page", () => {
  const r = normalizeSchemesResult(result([]));
  assert.equal(r.status, "unavailable");
});

test("keeps the agent's own unavailable reason", () => {
  const r = normalizeSchemesResult({
    status: "unavailable",
    reason: "The government scheme list is not available right now."
  });
  assert.equal(r.status, "unavailable");
  if (r.status !== "unavailable") return;
  assert.match(r.reason, /not available right now/);
});

test("supplies a reason when the agent sent an empty one", () => {
  const r = normalizeSchemesResult({ status: "unavailable", reason: "" });
  assert.equal(r.status, "unavailable");
  if (r.status !== "unavailable") return;
  assert.ok(r.reason.length > 0);
});

test("a non-object payload is unavailable, not a crash", () => {
  for (const junk of [null, "text", 42, []]) {
    assert.equal(normalizeSchemesResult(ok(junk)).status, "unavailable");
  }
});

test("no undefined or NaN reaches the rendered shape", () => {
  const r = normalizeSchemesResult(
    result([{ scheme, group: "matched", criteria: match.criteria, stale: false }])
  );
  assert.equal(r.status, "ok");
  if (r.status !== "ok") return;
  const serialized = JSON.stringify(r.data);
  assert.ok(!serialized.includes("undefined"));
  assert.ok(!serialized.includes("NaN"));
  assert.ok(!serialized.includes("null,null"));
});

test("criterion params keep only renderable scalars", () => {
  const r = normalizeSchemesResult(
    result([
      {
        ...match,
        criteria: [
          { key: "stateMatch", status: "matched", params: { state: "Tamil Nadu", junk: { a: 1 } } },
          { key: "landOwnership", status: "cannot_check", params: {} }
        ]
      }
    ])
  );
  assert.equal(r.status, "ok");
  if (r.status !== "ok") return;
  assert.deepEqual(r.data.matches[0].criteria[0].params, { state: "Tamil Nadu" });
  assert.equal(r.data.matches[0].criteria[1].params, null);
});
