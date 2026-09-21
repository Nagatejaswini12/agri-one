import type {
  DataResult,
  MarketPriceQuote,
  MarketSnapshot
} from "@agri-one/shared-types";

/**
 * The Market Agent runs in n8n, outside this codebase's type checking, so
 * a workflow edit can change its payload without the frontend knowing.
 * This coerces whatever actually arrives into `MarketSnapshot` — a price
 * the source didn't report becomes `null` and an unusable payload becomes
 * "unavailable", rather than crashing the page or rendering a stray
 * `undefined`.
 *
 * Nothing is invented here: no substituted prices, no filled-in dates, no
 * mandi the agent didn't send. In particular a missing price stays
 * `null` and never becomes 0 — see `MarketPriceQuote`.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/**
 * Numeric strings are tolerated because the source has been seen to send
 * both, but anything genuinely absent stays null.
 */
function asNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Only YYYY-MM-DD is accepted; anything else is "no readable date". */
function asIsoDate(value: unknown): string | null {
  const s = asString(value);
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [, mm, dd] = s.split("-").map(Number) as [number, number, number];
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  return s;
}

/**
 * A quote with no mandi name can't be labelled or told apart from the
 * others, so it's dropped rather than rendered as a blank row.
 */
function asQuotes(value: unknown): MarketPriceQuote[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const market = asString(item.market);
    if (!market) return [];
    return [
      {
        market,
        variety: asString(item.variety),
        grade: asString(item.grade),
        minPrice: asNumber(item.minPrice),
        maxPrice: asNumber(item.maxPrice),
        modalPrice: asNumber(item.modalPrice),
        reportedOn: asIsoDate(item.reportedOn)
      }
    ];
  });
}

export function normalizeMarketResult(
  result: DataResult<unknown>
): DataResult<MarketSnapshot> {
  if (result.status === "unavailable") {
    // The agent's own reason is the useful one — it names the district or
    // commodity that found nothing. Only replace it when it's missing.
    if (asString(result.reason)) return result;
    return { status: "unavailable", reason: "The market price service is currently unavailable." };
  }

  const data = result.data;
  if (!isRecord(data)) {
    return { status: "unavailable", reason: "The market price service returned an unreadable response." };
  }

  const quotes = asQuotes(data.quotes);

  // No usable quote means there is nothing to show. Saying so is better
  // than rendering an empty price table that looks like a zero market.
  if (quotes.length === 0) {
    return { status: "unavailable", reason: "No mandi prices were reported for this crop and district." };
  }

  const commodity = asString(data.commodity);
  const state = asString(data.state);
  const district = asString(data.district);

  // Without these the page can't say *what* it is quoting a price for,
  // and an unlabelled price is worse than no price.
  if (!commodity || !state || !district) {
    return { status: "unavailable", reason: "The market price service returned an unreadable response." };
  }

  return {
    status: "ok",
    asOf: asString(result.asOf) ?? new Date().toISOString(),
    source: asString(result.source) ?? "unknown",
    data: {
      commodity,
      state,
      district,
      latestReportedOn: asIsoDate(data.latestReportedOn),
      // The only unit this source quotes in; a future unit would need a
      // matching label in the locale files before it could be shown.
      priceUnit: "INR_PER_QUINTAL",
      quotes
    }
  };
}
