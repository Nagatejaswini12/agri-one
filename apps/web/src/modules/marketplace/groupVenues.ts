import type { MarketPriceQuote, MarketSnapshot } from "@agri-one/shared-types";

/**
 * Turns a market snapshot into "where you can sell" — the venues that
 * actually reported a price for this crop today.
 *
 * This is a view over verified market data, not a buyer directory. Every
 * venue here is a mandi the source named; no buyer, trader, contact
 * number or private party is invented, and none could be, because none
 * of that is in the data.
 *
 * Venues are grouped by variety and grade, and ranked only within a
 * group. Prices for different varieties of one commodity are not
 * comparable — Madurai onion on 2026-09-24 reported Bellary at ₹4,500
 * and Onion Green at ₹8,700 — so ranking them together would tell a
 * farmer they could get far more elsewhere when the real difference is
 * that it is a different product.
 */

/**
 * What kind of venue this is, read from the name the source itself
 * used. Nothing is inferred beyond that: a venue whose name carries no
 * recognised marker is simply "other", never guessed at.
 */
export type VenueKind = "farmersMarket" | "regulatedYard" | "other";

export interface SellingVenue {
  market: string;
  kind: VenueKind;
  modalPrice: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  reportedOn: string | null;
}

export interface VenueGroup {
  variety: string | null;
  grade: string | null;
  /** Highest modal price first; unpriced venues last. */
  venues: SellingVenue[];
}

export interface SellingPlaces {
  hasVenues: boolean;
  district: string;
  commodity: string;
  latestReportedOn: string | null;
  venueCount: number;
  groups: VenueGroup[];
}

/**
 * Tamil Nadu's Uzhavar Sandhai are government farmers' markets where a
 * farmer sells direct to consumers; an APMC is a regulated market yard.
 * Both markers come from AGMARKNET's own venue names.
 */
export function classifyVenue(market: string): VenueKind {
  if (/uzhavar\s*sandhai/i.test(market)) return "farmersMarket";
  if (/\bAPMC\b/i.test(market)) return "regulatedYard";
  return "other";
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function price(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toVenue(quote: MarketPriceQuote): SellingVenue | null {
  const market = text(quote?.market);
  // A venue with no name cannot be visited, so it is dropped rather
  // than rendered as a blank row.
  if (!market) return null;
  return {
    market,
    kind: classifyVenue(market),
    modalPrice: price(quote.modalPrice),
    minPrice: price(quote.minPrice),
    maxPrice: price(quote.maxPrice),
    reportedOn: text(quote.reportedOn)
  };
}

export function groupVenues(snapshot: MarketSnapshot | undefined): SellingPlaces {
  const empty: SellingPlaces = {
    hasVenues: false,
    district: snapshot?.district ?? "",
    commodity: snapshot?.commodity ?? "",
    latestReportedOn: snapshot?.latestReportedOn ?? null,
    venueCount: 0,
    groups: []
  };
  if (!snapshot || !Array.isArray(snapshot.quotes) || snapshot.quotes.length === 0) {
    return empty;
  }

  // Insertion-ordered so the output is stable for the same input.
  const order: string[] = [];
  const buckets = new Map<string, VenueGroup>();

  for (const quote of snapshot.quotes) {
    const venue = toVenue(quote);
    if (!venue) continue;

    const variety = text(quote.variety);
    const grade = text(quote.grade);
    const key = `${variety ?? "\u0000"}\u0001${grade ?? "\u0000"}`;

    if (!buckets.has(key)) {
      order.push(key);
      buckets.set(key, { variety, grade, venues: [] });
    }
    // The same mandi can legitimately appear under two varieties — it is
    // selling two different products — so entries are never merged
    // across groups.
    buckets.get(key)?.venues.push(venue);
  }

  const groups = order
    .map((key) => buckets.get(key))
    .filter((g): g is VenueGroup => g !== undefined)
    .map((g) => ({
      ...g,
      venues: [...g.venues].sort((a, b) => {
        // A venue that reported no modal price is still a real place
        // that traded today, so it is listed — just last, since it
        // cannot be ranked.
        if (a.modalPrice === null && b.modalPrice === null) return a.market.localeCompare(b.market);
        if (a.modalPrice === null) return 1;
        if (b.modalPrice === null) return -1;
        return b.modalPrice - a.modalPrice || a.market.localeCompare(b.market);
      })
    }))
    .filter((g) => g.venues.length > 0);

  const venueCount = groups.reduce((n, g) => n + g.venues.length, 0);

  return {
    hasVenues: venueCount > 0,
    district: snapshot.district,
    commodity: snapshot.commodity,
    latestReportedOn: snapshot.latestReportedOn,
    venueCount,
    groups
  };
}
