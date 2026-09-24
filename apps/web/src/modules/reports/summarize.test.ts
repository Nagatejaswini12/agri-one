import assert from "node:assert/strict";
import test from "node:test";
import type { FarmFinancialRecord, YieldRecord } from "@agri-one/shared-types";
import { summarizeFinancials, summarizeYields } from "./summarize.ts";

/**
 * Run with `npm run test -w @agri-one/web`.
 *
 * The load-bearing assertions are the two that keep Reports honest: an
 * empty ledger must not produce zeros, and yields in different units
 * must never be added together.
 */

const fin = (over: Partial<FarmFinancialRecord> = {}): FarmFinancialRecord => ({
  id: "f1",
  farmId: "farm-1",
  cropId: "crop-1",
  type: "cost",
  category: "seed",
  amount: 100,
  quantity: null,
  unit: null,
  recordedOn: "2026-09-01",
  notes: null,
  ...over
});

const yld = (over: Partial<YieldRecord> = {}): YieldRecord => ({
  id: "y1",
  farmId: "farm-1",
  cropId: "crop-1",
  quantity: 10,
  unit: "quintal",
  harvestedOn: "2026-09-01",
  ...over
});

test("no entries means no numbers, not zero rupees", () => {
  for (const input of [undefined, []]) {
    const s = summarizeFinancials(input);
    assert.equal(s.hasEntries, false);
    assert.equal(s.entryCount, 0);
    assert.equal(s.revenueByCategory.length, 0);
    assert.equal(s.byCrop.length, 0);
  }
  for (const input of [undefined, []]) {
    const y = summarizeYields(input);
    assert.equal(y.hasEntries, false);
    assert.equal(y.totals.length, 0);
  }
});

test("totals count only what was entered", () => {
  const s = summarizeFinancials([
    fin({ id: "a", type: "revenue", category: "sale", amount: 5000 }),
    fin({ id: "b", type: "cost", category: "seed", amount: 1200 }),
    fin({ id: "c", type: "cost", category: "labour", amount: 800 })
  ]);
  assert.equal(s.hasEntries, true);
  assert.equal(s.entryCount, 3);
  assert.equal(s.revenue, 5000);
  assert.equal(s.cost, 2000);
});

test("margin is exactly entered revenue minus entered cost", () => {
  const s = summarizeFinancials([
    fin({ id: "a", type: "revenue", amount: 5000 }),
    fin({ id: "b", type: "cost", amount: 1200 })
  ]);
  assert.equal(s.margin, 3800);
  assert.equal(s.margin, s.revenue - s.cost);
});

test("margin can be negative and is not clamped", () => {
  const s = summarizeFinancials([
    fin({ id: "a", type: "revenue", amount: 500 }),
    fin({ id: "b", type: "cost", amount: 2000 })
  ]);
  assert.equal(s.margin, -1500);
});

test("revenue-only and cost-only ledgers are not padded with the other side", () => {
  const revenueOnly = summarizeFinancials([fin({ type: "revenue", amount: 900 })]);
  assert.equal(revenueOnly.revenue, 900);
  assert.equal(revenueOnly.cost, 0);
  assert.equal(revenueOnly.costByCategory.length, 0);

  const costOnly = summarizeFinancials([fin({ type: "cost", amount: 300 })]);
  assert.equal(costOnly.revenueByCategory.length, 0);
});

test("categories are grouped by their stored key", () => {
  const s = summarizeFinancials([
    fin({ id: "a", type: "cost", category: "seed", amount: 100 }),
    fin({ id: "b", type: "cost", category: "seed", amount: 150 }),
    fin({ id: "c", type: "cost", category: "labour", amount: 400 })
  ]);
  assert.deepEqual(s.costByCategory, [
    { category: "labour", amount: 400 },
    { category: "seed", amount: 250 }
  ]);
});

test("farm-level entries group under a null crop and sort last", () => {
  const s = summarizeFinancials([
    fin({ id: "a", cropId: null, type: "cost", amount: 500 }),
    fin({ id: "b", cropId: "crop-1", type: "revenue", amount: 900 })
  ]);
  assert.equal(s.byCrop.length, 2);
  assert.equal(s.byCrop[s.byCrop.length - 1].cropId, null);
  const farmLevel = s.byCrop.find((c) => c.cropId === null);
  assert.equal(farmLevel?.cost, 500);
  assert.equal(farmLevel?.margin, -500);
});

test("a malformed financial row is dropped, not half-counted", () => {
  const s = summarizeFinancials([
    fin({ id: "ok", type: "revenue", amount: 1000 }),
    fin({ id: "bad-amount", amount: Number.NaN }),
    fin({ id: "bad-type", type: "donation" as FarmFinancialRecord["type"] }),
    fin({ id: "bad-amount-2", amount: "500" as unknown as number })
  ]);
  assert.equal(s.entryCount, 1);
  assert.equal(s.revenue, 1000);
  assert.equal(s.cost, 0);
  assert.ok(Number.isFinite(s.margin));
});

test("yields are never summed across different units", () => {
  const y = summarizeYields([
    yld({ id: "a", quantity: 10, unit: "quintal" }),
    yld({ id: "b", quantity: 4, unit: "quintal" }),
    yld({ id: "c", quantity: 25, unit: "bag" })
  ]);
  assert.equal(y.totals.length, 2);
  const quintal = y.totals.find((t) => t.unit === "quintal");
  const bag = y.totals.find((t) => t.unit === "bag");
  assert.equal(quintal?.quantity, 14);
  assert.equal(bag?.quantity, 25);
  // 14 + 25 = 39 must never appear as a single total.
  assert.ok(!y.totals.some((t) => t.quantity === 39));
});

test("per-crop yields also stay separated by unit", () => {
  const y = summarizeYields([
    yld({ id: "a", cropId: "crop-1", quantity: 10, unit: "quintal" }),
    yld({ id: "b", cropId: "crop-1", quantity: 5, unit: "bag" }),
    yld({ id: "c", cropId: "crop-2", quantity: 7, unit: "quintal" })
  ]);
  assert.equal(y.byCrop.length, 2);
  const crop1 = y.byCrop.find((c) => c.cropId === "crop-1");
  assert.equal(crop1?.totals.length, 2);
});

test("unit whitespace does not create a second unit", () => {
  const y = summarizeYields([
    yld({ id: "a", quantity: 3, unit: "quintal" }),
    yld({ id: "b", quantity: 2, unit: "  quintal  " })
  ]);
  assert.equal(y.totals.length, 1);
  assert.equal(y.totals[0].quantity, 5);
  assert.equal(y.totals[0].entries, 2);
});

test("a malformed yield row is dropped", () => {
  const y = summarizeYields([
    yld({ id: "ok" }),
    yld({ id: "no-unit", unit: "  " }),
    yld({ id: "bad-qty", quantity: Number.NaN }),
    yld({ id: "no-crop", cropId: "" })
  ]);
  assert.equal(y.entryCount, 1);
});

test("no undefined or NaN reaches either summary", () => {
  const s = JSON.stringify(
    summarizeFinancials([fin({ type: "revenue", amount: 10 }), fin({ type: "cost", amount: 4 })])
  );
  const y = JSON.stringify(summarizeYields([yld()]));
  for (const out of [s, y]) {
    assert.ok(!out.includes("undefined"));
    assert.ok(!out.includes("NaN"));
  }
});

test("a zero-amount entry is preserved, not treated as missing", () => {
  // A farmer may legitimately record a zero — a free input, a waived fee.
  const s = summarizeFinancials([fin({ type: "cost", amount: 0 })]);
  assert.equal(s.hasEntries, true);
  assert.equal(s.entryCount, 1);
  assert.equal(s.cost, 0);
});
