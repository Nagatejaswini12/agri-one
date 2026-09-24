import assert from "node:assert/strict";
import test from "node:test";
import type { MarketPriceQuote, MarketSnapshot } from "@agri-one/shared-types";
import { classifyVenue, groupVenues } from "./groupVenues.ts";

/**
 * Marketplace is a view over verified market data, not a buyer
 * directory. The load-bearing assertions are that venues never rank
 * across varieties, that a venue's type is read from the source's own
 * name rather than guessed, and that nothing is invented when the
 * source is silent.
 */

const quote = (over: Partial<MarketPriceQuote> = {}): MarketPriceQuote => ({
  market: "Udumalpet APMC",
  variety: "Local",
  grade: "FAQ",
  minPrice: 2500,
  maxPrice: 3000,
  modalPrice: 2750,
  reportedOn: "2026-09-24",
  ...over
});

const snapshot = (quotes: MarketPriceQuote[]): MarketSnapshot => ({
  commodity: "Tomato",
  state: "Tamil Nadu",
  district: "Coimbatore",
  latestReportedOn: "2026-09-24",
  priceUnit: "INR_PER_QUINTAL",
  quotes
});

test("venue type is read from the source's own name", () => {
  assert.equal(classifyVenue("Vadavalli(Uzhavar Sandhai )"), "farmersMarket");
  assert.equal(classifyVenue("Udumalpet APMC"), "regulatedYard");
  assert.equal(classifyVenue("APMC Pune"), "regulatedYard");
  assert.equal(classifyVenue("Pune(Moshi)"), "other");
  assert.equal(classifyVenue("Khairagarh APMC"), "regulatedYard");
});

test("an unrecognised venue name is 'other', never guessed", () => {
  assert.equal(classifyVenue("Some Place"), "other");
  assert.equal(classifyVenue(""), "other");
});

test("venues group by variety and grade", () => {
  const places = groupVenues(
    snapshot([
      quote({ market: "A", variety: "Bellary", modalPrice: 4500 }),
      quote({ market: "B", variety: "Bellary", modalPrice: 7000 }),
      quote({ market: "C", variety: "Onion Green", modalPrice: 8250 })
    ])
  );
  assert.equal(places.groups.length, 2);
  assert.equal(places.venueCount, 3);
  const bellary = places.groups.find((g) => g.variety === "Bellary");
  assert.equal(bellary?.venues.length, 2);
});

test("ranking happens only within a variety, never across", () => {
  // The real Madurai case: Onion Green at 8250 must never outrank
  // Bellary venues inside the Bellary group.
  const places = groupVenues(
    snapshot([
      quote({ market: "Melur", variety: "Bellary", modalPrice: 4500 }),
      quote({ market: "Anna nagar", variety: "Onion Green", modalPrice: 8250 }),
      quote({ market: "Thirumangalam", variety: "Bellary", modalPrice: 7000 })
    ])
  );
  const bellary = places.groups.find((g) => g.variety === "Bellary");
  assert.deepEqual(
    bellary?.venues.map((v) => v.market),
    ["Thirumangalam", "Melur"]
  );
  assert.ok(!bellary?.venues.some((v) => v.market === "Anna nagar"));
});

test("the same mandi under two varieties is listed once per variety", () => {
  const places = groupVenues(
    snapshot([
      quote({ market: "Anaiyur", variety: "Bellary", modalPrice: 6250 }),
      quote({ market: "Anaiyur", variety: "Onion Green", modalPrice: 8250 })
    ])
  );
  assert.equal(places.groups.length, 2);
  assert.equal(places.venueCount, 2);
  assert.ok(places.groups.every((g) => g.venues.length === 1));
  assert.ok(places.groups.every((g) => g.venues[0].market === "Anaiyur"));
});

test("a different grade is a different group", () => {
  const places = groupVenues(
    snapshot([
      quote({ market: "A", variety: "Local", grade: "FAQ" }),
      quote({ market: "B", variety: "Local", grade: "Non-FAQ" })
    ])
  );
  assert.equal(places.groups.length, 2);
});

test("a venue with no modal price is kept but ranked last, never as ₹0", () => {
  const places = groupVenues(
    snapshot([
      quote({ market: "NoPrice", modalPrice: null }),
      quote({ market: "Priced", modalPrice: 3000 })
    ])
  );
  const venues = places.groups[0].venues;
  assert.deepEqual(
    venues.map((v) => v.market),
    ["Priced", "NoPrice"]
  );
  assert.equal(venues[1].modalPrice, null);
  assert.notEqual(venues[1].modalPrice, 0);
});

test("a quote with no mandi name is dropped", () => {
  const places = groupVenues(
    snapshot([quote({ market: "   " }), quote({ market: "Real" })])
  );
  assert.equal(places.venueCount, 1);
  assert.equal(places.groups[0].venues[0].market, "Real");
});

test("an empty snapshot reports no venues rather than an empty list", () => {
  const places = groupVenues(snapshot([]));
  assert.equal(places.hasVenues, false);
  assert.equal(places.venueCount, 0);
  assert.deepEqual(places.groups, []);
});

test("an undefined snapshot does not crash or invent a venue", () => {
  const places = groupVenues(undefined);
  assert.equal(places.hasVenues, false);
  assert.equal(places.venueCount, 0);
});

test("a missing variety groups separately from a named one", () => {
  const places = groupVenues(
    snapshot([
      quote({ market: "A", variety: null }),
      quote({ market: "B", variety: "Local" })
    ])
  );
  assert.equal(places.groups.length, 2);
  assert.ok(places.groups.some((g) => g.variety === null));
});

test("group and venue order is stable for the same input", () => {
  const input = snapshot([
    quote({ market: "A", variety: "Local", modalPrice: 1000 }),
    quote({ market: "B", variety: "Bellary", modalPrice: 2000 }),
    quote({ market: "C", variety: "Local", modalPrice: 3000 })
  ]);
  const first = groupVenues(input);
  const second = groupVenues(input);
  assert.deepEqual(
    first.groups.map((g) => g.variety),
    second.groups.map((g) => g.variety)
  );
  assert.deepEqual(first.groups.map((g) => g.variety), ["Local", "Bellary"]);
});

test("nothing resembling buyer contact data is produced", () => {
  const places = groupVenues(
    snapshot([quote({ market: "Udumalpet APMC" }), quote({ market: "Vadavalli(Uzhavar Sandhai )" })])
  );
  const serialized = JSON.stringify(places);
  // A venue carries a name, a type and prices — no person, phone or
  // email, because none of that exists in the source.
  for (const venue of places.groups.flatMap((g) => g.venues)) {
    assert.deepEqual(Object.keys(venue).sort(), [
      "kind",
      "market",
      "maxPrice",
      "minPrice",
      "modalPrice",
      "reportedOn"
    ]);
  }
  assert.ok(!/phone|mobile|contact|email|@|\+91/i.test(serialized));
  assert.ok(!serialized.includes("undefined"));
  assert.ok(!serialized.includes("NaN"));
});

test("the district and crop are echoed from the snapshot, never substituted", () => {
  const places = groupVenues(snapshot([quote()]));
  assert.equal(places.district, "Coimbatore");
  assert.equal(places.commodity, "Tomato");
  assert.equal(places.latestReportedOn, "2026-09-24");
});
