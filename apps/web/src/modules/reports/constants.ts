/**
 * The category and unit keys Reports can store.
 *
 * These are stable keys, never display text: the key is what goes into
 * Postgres, and the UI renders it through `reports.category.*` /
 * `reports.unitName.*` so a farmer reads it in their own language.
 *
 * They live in a plain module rather than beside the forms so the i18n
 * coverage test can import them — Node's type stripping runs `.ts` but
 * not `.tsx`, and a label that exists only inside a component is a label
 * no test can prove is translated.
 *
 * "fertilizer" here is a *cost category*, the same way a receipt has
 * one. Nothing in this module recommends buying or applying anything.
 */

export const COST_CATEGORIES = [
  "seed",
  "fertilizer",
  "labour",
  "irrigation",
  "machinery",
  "transport",
  "other"
] as const;

export const REVENUE_CATEGORIES = ["sale", "subsidy", "other"] as const;

/**
 * Units are never converted into one another: totals stay grouped by the
 * unit the farmer chose, because converting bags to quintals would need
 * a crop-specific weight this app does not know.
 */
export const YIELD_UNITS = ["quintal", "kg", "tonne", "bag"] as const;

/** Today in the browser's own timezone, for a date field's default. */
export function todayIso(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}
