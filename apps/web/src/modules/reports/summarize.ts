import type { FarmFinancialRecord, YieldRecord } from "@agri-one/shared-types";

/**
 * Totals for the Reports page, computed from stored entries only.
 *
 * Two rules shape everything here:
 *
 *  1. **No entries means no numbers.** An empty ledger returns
 *     `hasEntries: false` and the page shows an empty state — it does
 *     not show ₹0. A farmer who has recorded nothing has not earned
 *     nothing; the app simply doesn't know, and printing a zero would
 *     be a fabricated value dressed as a fact.
 *  2. **Nothing is derived beyond arithmetic on what was entered.**
 *     `margin` is exactly `revenue − cost` over the farmer's own rows.
 *     There is no estimation, no projection, no filling of gaps.
 *
 * Yields are grouped by unit and **never summed across units**: adding
 * quintals to bags would invent a number that means nothing. A farm that
 * recorded both gets both totals, separately.
 */

export interface CategoryTotal {
  /** The stored key, rendered by the UI through `reports.category.*`. */
  category: string;
  amount: number;
}

export interface CropFinancialTotal {
  /** null groups the farm-level entries that belong to no single crop. */
  cropId: string | null;
  revenue: number;
  cost: number;
  margin: number;
}

export interface YieldTotal {
  unit: string;
  quantity: number;
  /** How many entries this total came from, so it can be shown as such. */
  entries: number;
}

export interface CropYieldTotal {
  cropId: string;
  totals: YieldTotal[];
}

export interface FinancialSummary {
  hasEntries: boolean;
  entryCount: number;
  revenue: number;
  cost: number;
  /** Exactly revenue − cost. Never an estimate. */
  margin: number;
  revenueByCategory: CategoryTotal[];
  costByCategory: CategoryTotal[];
  byCrop: CropFinancialTotal[];
}

export interface YieldSummary {
  hasEntries: boolean;
  entryCount: number;
  /** Per unit, because quantities in different units are not addable. */
  totals: YieldTotal[];
  byCrop: CropYieldTotal[];
}

/** A row missing the fields a total depends on is dropped, not guessed at. */
function isUsableFinancial(r: FarmFinancialRecord): boolean {
  return (
    !!r &&
    (r.type === "cost" || r.type === "revenue") &&
    typeof r.amount === "number" &&
    Number.isFinite(r.amount)
  );
}

function isUsableYield(r: YieldRecord): boolean {
  return (
    !!r &&
    typeof r.quantity === "number" &&
    Number.isFinite(r.quantity) &&
    typeof r.unit === "string" &&
    r.unit.trim() !== "" &&
    typeof r.cropId === "string" &&
    r.cropId !== ""
  );
}

function sortedTotals(map: Map<string, number>): CategoryTotal[] {
  return [...map.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount || a.category.localeCompare(b.category));
}

export function summarizeFinancials(
  records: FarmFinancialRecord[] | undefined
): FinancialSummary {
  const usable = (records ?? []).filter(isUsableFinancial);

  const empty: FinancialSummary = {
    hasEntries: false,
    entryCount: 0,
    revenue: 0,
    cost: 0,
    margin: 0,
    revenueByCategory: [],
    costByCategory: [],
    byCrop: []
  };
  // The zeros above are never rendered: hasEntries gates the whole
  // summary, and the page shows its empty state instead.
  if (usable.length === 0) return empty;

  let revenue = 0;
  let cost = 0;
  const revenueByCategory = new Map<string, number>();
  const costByCategory = new Map<string, number>();
  const crops = new Map<string | null, { revenue: number; cost: number }>();

  for (const r of usable) {
    const bucket = crops.get(r.cropId) ?? { revenue: 0, cost: 0 };
    if (r.type === "revenue") {
      revenue += r.amount;
      revenueByCategory.set(r.category, (revenueByCategory.get(r.category) ?? 0) + r.amount);
      bucket.revenue += r.amount;
    } else {
      cost += r.amount;
      costByCategory.set(r.category, (costByCategory.get(r.category) ?? 0) + r.amount);
      bucket.cost += r.amount;
    }
    crops.set(r.cropId, bucket);
  }

  return {
    hasEntries: true,
    entryCount: usable.length,
    revenue,
    cost,
    margin: revenue - cost,
    revenueByCategory: sortedTotals(revenueByCategory),
    costByCategory: sortedTotals(costByCategory),
    byCrop: [...crops.entries()]
      .map(([cropId, v]) => ({ cropId, revenue: v.revenue, cost: v.cost, margin: v.revenue - v.cost }))
      // Farm-level entries (cropId null) sort last, after the named crops.
      .sort((a, b) => {
        if (a.cropId === null) return 1;
        if (b.cropId === null) return -1;
        return b.margin - a.margin;
      })
  };
}

export function summarizeYields(records: YieldRecord[] | undefined): YieldSummary {
  const usable = (records ?? []).filter(isUsableYield);
  if (usable.length === 0) {
    return { hasEntries: false, entryCount: 0, totals: [], byCrop: [] };
  }

  const byUnit = new Map<string, { quantity: number; entries: number }>();
  const byCrop = new Map<string, Map<string, { quantity: number; entries: number }>>();

  for (const r of usable) {
    const unit = r.unit.trim();

    const overall = byUnit.get(unit) ?? { quantity: 0, entries: 0 };
    overall.quantity += r.quantity;
    overall.entries += 1;
    byUnit.set(unit, overall);

    const cropUnits = byCrop.get(r.cropId) ?? new Map();
    const cropTotal = cropUnits.get(unit) ?? { quantity: 0, entries: 0 };
    cropTotal.quantity += r.quantity;
    cropTotal.entries += 1;
    cropUnits.set(unit, cropTotal);
    byCrop.set(r.cropId, cropUnits);
  }

  const toTotals = (m: Map<string, { quantity: number; entries: number }>): YieldTotal[] =>
    [...m.entries()]
      .map(([unit, v]) => ({ unit, quantity: v.quantity, entries: v.entries }))
      .sort((a, b) => a.unit.localeCompare(b.unit));

  return {
    hasEntries: true,
    entryCount: usable.length,
    totals: toTotals(byUnit),
    byCrop: [...byCrop.entries()]
      .map(([cropId, units]) => ({ cropId, totals: toTotals(units) }))
      .sort((a, b) => a.cropId.localeCompare(b.cropId))
  };
}
