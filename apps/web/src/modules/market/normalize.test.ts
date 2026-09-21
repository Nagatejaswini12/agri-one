import assert from "node:assert/strict";
import test from "node:test";
import type { DataResult } from "@agri-one/shared-types";
import { normalizeMarketResult } from "./normalize.ts";

/**
 * Run with `npm run test -w @agri-one/web` (Node's own test runner and
 * type stripping — no test framework dependency).
 *
 * These cover the cases the agent can actually produce, since the agent
 * lives in n8n and can change without this codebase noticing: the point
 * of the normalizer is that no such change can make the UI render an
 * invented price.
 */

function ok(data: unknown): DataResult<unknown> {
  return { status: "ok", asOf: "2026-09-21T03:00:00.000Z", source: "agmarknet-data.gov.in", data };
}

const quote = {
  market: "Thiruvallur",
  variety: "Local",
  grade: "FAQ",
  minPrice: 2000,
  maxPrice: 3000,
  modalPrice: 2500,
  reportedOn: "2026-09-20"
};

test("passes a well-formed snapshot through unchanged", () => {
  const r = normalizeMarketResult(
    ok({
      commodity: "Tomato",
      state: "Tamil Nadu",
      district: "Thiruvellore",
      latestReportedOn: "2026-09-20",
      priceUnit: "INR_PER_QUINTAL",
      quotes: [quote]
    })
  );
  assert.equal(r.status, "ok");
  if (r.status !== "ok") return;
  assert.equal(r.data.commodity, "Tomato");
  assert.equal(r.data.district, "Thiruvellore");
  assert.equal(r.data.latestReportedOn, "2026-09-20");
  assert.equal(r.data.quotes.length, 1);
  assert.deepEqual(r.data.quotes[0], quote);
});

test("keeps the agent's own unavailable reason", () => {
  const r = normalizeMarketResult({
    status: "unavailable",
    reason: "No market data was reported today for Tomato in Ariyalur."
  });
  assert.equal(r.status, "unavailable");
  if (r.status !== "unavailable") return;
  assert.match(r.reason, /Ariyalur/);
});

test("supplies a reason when the agent sent an empty one", () => {
  const r = normalizeMarketResult({ status: "unavailable", reason: "" });
  assert.equal(r.status, "unavailable");
  if (r.status !== "unavailable") return;
  assert.ok(r.reason.length > 0);
});

test("an absent price stays null and never becomes 0", () => {
  const r = normalizeMarketResult(
    ok({
      commodity: "Onion",
      state: "Tamil Nadu",
      district: "Ariyalur",
      latestReportedOn: "2026-09-20",
      priceUnit: "INR_PER_QUINTAL",
      quotes: [{ ...quote, minPrice: null, maxPrice: undefined, modalPrice: "", grade: "  " }]
    })
  );
  assert.equal(r.status, "ok");
  if (r.status !== "ok") return;
  const q = r.data.quotes[0];
  assert.equal(q.minPrice, null);
  assert.equal(q.maxPrice, null);
  assert.equal(q.modalPrice, null);
  assert.equal(q.grade, null);
});

test("a real zero price is preserved, not treated as missing", () => {
  const r = normalizeMarketResult(
    ok({
      commodity: "Tomato",
      state: "Tamil Nadu",
      district: "Thiruvellore",
      latestReportedOn: "2026-09-20",
      priceUnit: "INR_PER_QUINTAL",
      quotes: [{ ...quote, minPrice: 0 }]
    })
  );
  assert.equal(r.status, "ok");
  if (r.status !== "ok") return;
  assert.equal(r.data.quotes[0].minPrice, 0);
});

test("numeric strings from the source are accepted", () => {
  const r = normalizeMarketResult(
    ok({
      commodity: "Tomato",
      state: "Tamil Nadu",
      district: "Thiruvellore",
      latestReportedOn: "2026-09-20",
      priceUnit: "INR_PER_QUINTAL",
      quotes: [{ ...quote, modalPrice: "2750" }]
    })
  );
  assert.equal(r.status, "ok");
  if (r.status !== "ok") return;
  assert.equal(r.data.quotes[0].modalPrice, 2750);
});

test("zero quotes becomes unavailable rather than an empty table", () => {
  const r = normalizeMarketResult(
    ok({
      commodity: "Tomato",
      state: "Tamil Nadu",
      district: "Thiruvellore",
      latestReportedOn: null,
      priceUnit: "INR_PER_QUINTAL",
      quotes: []
    })
  );
  assert.equal(r.status, "unavailable");
});

test("a quote with no mandi name is dropped", () => {
  const r = normalizeMarketResult(
    ok({
      commodity: "Tomato",
      state: "Tamil Nadu",
      district: "Thiruvellore",
      latestReportedOn: "2026-09-20",
      priceUnit: "INR_PER_QUINTAL",
      quotes: [quote, { ...quote, market: "   " }, { ...quote, market: null }]
    })
  );
  assert.equal(r.status, "ok");
  if (r.status !== "ok") return;
  assert.equal(r.data.quotes.length, 1);
});

test("every reported mandi is kept, never trimmed to a best price", () => {
  const many = Array.from({ length: 12 }, (_, i) => ({ ...quote, market: `Mandi ${i}` }));
  const r = normalizeMarketResult(
    ok({
      commodity: "Tomato",
      state: "Tamil Nadu",
      district: "Thiruvellore",
      latestReportedOn: "2026-09-20",
      priceUnit: "INR_PER_QUINTAL",
      quotes: many
    })
  );
  assert.equal(r.status, "ok");
  if (r.status !== "ok") return;
  assert.equal(r.data.quotes.length, 12);
});

test("an unparseable date becomes null instead of today", () => {
  const r = normalizeMarketResult(
    ok({
      commodity: "Tomato",
      state: "Tamil Nadu",
      district: "Thiruvellore",
      latestReportedOn: "20/09/2026",
      priceUnit: "INR_PER_QUINTAL",
      quotes: [{ ...quote, reportedOn: "not-a-date" }]
    })
  );
  assert.equal(r.status, "ok");
  if (r.status !== "ok") return;
  assert.equal(r.data.latestReportedOn, null);
  assert.equal(r.data.quotes[0].reportedOn, null);
});

test("an impossible calendar date is rejected", () => {
  const r = normalizeMarketResult(
    ok({
      commodity: "Tomato",
      state: "Tamil Nadu",
      district: "Thiruvellore",
      latestReportedOn: "2026-13-45",
      priceUnit: "INR_PER_QUINTAL",
      quotes: [quote]
    })
  );
  assert.equal(r.status, "ok");
  if (r.status !== "ok") return;
  assert.equal(r.data.latestReportedOn, null);
});

test("a snapshot missing its commodity/state/district is unusable", () => {
  for (const missing of ["commodity", "state", "district"]) {
    const data: Record<string, unknown> = {
      commodity: "Tomato",
      state: "Tamil Nadu",
      district: "Thiruvellore",
      latestReportedOn: "2026-09-20",
      priceUnit: "INR_PER_QUINTAL",
      quotes: [quote]
    };
    delete data[missing];
    assert.equal(normalizeMarketResult(ok(data)).status, "unavailable", `missing ${missing}`);
  }
});

test("a non-object payload is unavailable, not a crash", () => {
  for (const junk of [null, "text", 42, []]) {
    assert.equal(normalizeMarketResult(ok(junk)).status, "unavailable");
  }
});

test("priceUnit is always the unit the source actually quotes in", () => {
  const r = normalizeMarketResult(
    ok({
      commodity: "Tomato",
      state: "Tamil Nadu",
      district: "Thiruvellore",
      latestReportedOn: "2026-09-20",
      priceUnit: "INR_PER_KG",
      quotes: [quote]
    })
  );
  assert.equal(r.status, "ok");
  if (r.status !== "ok") return;
  assert.equal(r.data.priceUnit, "INR_PER_QUINTAL");
});
