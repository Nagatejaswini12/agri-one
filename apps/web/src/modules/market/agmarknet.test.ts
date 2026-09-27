import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DISTRICT_ALIASES,
  DISTRICT_MAP,
  STATE_ALIASES,
  agmarknetQuery,
  mapAgmarknet,
  resolveLocation,
  toIsoDate
} from "./agmarknet.ts";

/**
 * These pin the resolution and mapping that moved out of the n8n
 * workflow. A farmer must see the same thing from a different caller, so
 * the behaviour that matters — never guessing a district, never turning
 * an absent price into zero — is asserted directly.
 */

const FIXED = () => new Date("2026-09-27T00:00:00.000Z");
const RESOLVED = { state: "Tamil Nadu", district: "Coimbatore", commodity: "Tomato" };

// ------------------------------------------------ the captured vocabulary

test("the district map carries AGMARKNET's full captured vocabulary", () => {
  const states = Object.keys(DISTRICT_MAP);
  const districts = states.reduce((n, s) => n + DISTRICT_MAP[s].length, 0);
  assert.equal(states.length, 21);
  assert.equal(districts, 284);
});

test("the consonant-skeleton rule collides for no two districts in a state", () => {
  const skel = (v: string) =>
    v.toLowerCase().replace(/[^a-z]/g, "").replace(/h/g, "").replace(/[aeiou]/g, "").replace(/(.)\1+/g, "$1");
  for (const [state, list] of Object.entries(DISTRICT_MAP)) {
    const seen = new Map<string, string>();
    for (const d of list) {
      const k = skel(d);
      assert.ok(!seen.has(k), `${state}: "${d}" collides with "${seen.get(k)}" on skeleton "${k}"`);
      seen.set(k, d);
    }
  }
});

// ------------------------------------------------------------ resolution

test("an exact district resolves", () => {
  const r = resolveLocation("Tamil Nadu", "Coimbatore", "Tomato");
  assert.equal(r.resolved, true);
  assert.equal(r.state, "Tamil Nadu");
  assert.equal(r.district, "Coimbatore");
  assert.equal(r.reason, null);
});

test("a spelling variant resolves to AGMARKNET's own spelling", () => {
  const r = resolveLocation("Tamil Nadu", "Thiruvallur", "Tomato");
  assert.equal(r.resolved, true);
  assert.equal(r.district, "Thiruvellore");
});

test("state aliases that are not spelling variants resolve", () => {
  for (const [alias, target] of Object.entries(STATE_ALIASES)) {
    const r = resolveLocation(alias, DISTRICT_MAP[target][0], "Tomato");
    assert.equal(r.resolved, true, `${alias} -> ${target}`);
    assert.equal(r.state, target);
  }
});

test("district nicknames resolve to the real district", () => {
  for (const [alias, target] of Object.entries(DISTRICT_ALIASES["Tamil Nadu"])) {
    const r = resolveLocation("Tamil Nadu", alias, "Tomato");
    assert.equal(r.resolved, true, `${alias} -> ${target}`);
    assert.equal(r.district, target);
  }
});

test("an unknown state is refused rather than guessed", () => {
  const r = resolveLocation("Atlantis", "Coimbatore", "Tomato");
  assert.equal(r.resolved, false);
  assert.equal(r.reasonKey, "state");
  assert.match(String(r.reason), /Atlantis/);
});

test("an unknown district is refused, and the message names what was searched", () => {
  const r = resolveLocation("Tamil Nadu", "Nowhereville", "Tomato");
  assert.equal(r.resolved, false);
  assert.equal(r.reasonKey, "district");
  assert.match(String(r.reason), /Nowhereville/);
  assert.match(String(r.reason), /Tamil Nadu/);
});

test("a district from the wrong state does not resolve — matching is state-scoped", () => {
  const r = resolveLocation("Tamil Nadu", "Lucknow", "Tomato");
  assert.equal(r.resolved, false);
});

test("a missing crop is refused before any query is built", () => {
  const r = resolveLocation("Tamil Nadu", "Coimbatore", "   ");
  assert.equal(r.resolved, false);
  assert.equal(r.reasonKey, "commodity");
});

test("every captured district resolves to itself", () => {
  for (const [state, list] of Object.entries(DISTRICT_MAP)) {
    for (const d of list) {
      const r = resolveLocation(state, d, "Tomato");
      assert.equal(r.resolved, true, `${state}/${d}`);
      assert.equal(r.district, d);
    }
  }
});

// ---------------------------------------------------------- the request

test("the query matches what the workflow sent", () => {
  const q = agmarknetQuery(RESOLVED);
  assert.equal(q.get("format"), "json");
  assert.equal(q.get("limit"), "100");
  assert.equal(q.get("filters[state]"), "Tamil Nadu");
  assert.equal(q.get("filters[district]"), "Coimbatore");
  assert.equal(q.get("filters[commodity]"), "Tomato");
  assert.equal(q.get("api-key"), null, "the key is never built into the shared query");
});

test("the query carries whatever was asked for — there is no default", () => {
  // Coimbatore/Tomato is a test combination, not a fallback. Every
  // supported state, district and crop must travel through unchanged.
  const combos = [
    { state: "Tamil Nadu", district: "Madurai", commodity: "Onion" },
    { state: "Maharashtra", district: "Pune", commodity: "Onion" },
    { state: "Uttar Pradesh", district: "Agra", commodity: "Potato" },
    { state: "Keralam", district: "Ernakulam", commodity: "Banana" },
    { state: "Punjab", district: "Ludhiana", commodity: "Wheat" }
  ];
  for (const c of combos) {
    const q = agmarknetQuery(c);
    assert.equal(q.get("filters[state]"), c.state);
    assert.equal(q.get("filters[district]"), c.district);
    assert.equal(q.get("filters[commodity]"), c.commodity);
    assert.notEqual(q.get("filters[district]"), "Coimbatore");
    assert.notEqual(q.get("filters[commodity]"), "Tomato");
  }
});

test("a district that is genuinely elsewhere resolves to nothing, not to the nearest real one", () => {
  for (const bad of ["Nowhereville", "", "   ", "12345", "Reykjavik", "Pune"]) {
    const r = resolveLocation("Tamil Nadu", bad, "Tomato");
    assert.equal(r.resolved, false, `"${bad}" should not resolve in Tamil Nadu`);
    assert.equal(r.district, "", `"${bad}" must not yield a district`);
  }
});

test("a vowel variant of a district DOES resolve — that is the rule, not a fallback", () => {
  // Indic transliteration varies almost entirely in vowels and
  // aspirates, so the consonant skeleton is deliberately what matches.
  // "Coimbatoor" is the same place spelled differently, and resolving it
  // is the feature; what must never resolve is a different place.
  for (const variant of ["Coimbatoor", "coimbatore", "COIMBATORE", "Coimbatore "]) {
    const r = resolveLocation("Tamil Nadu", variant, "Tomato");
    assert.equal(r.resolved, true, `"${variant}" is the same district`);
    assert.equal(r.district, "Coimbatore");
  }
});

test("the rule normalises vowels and aspirates, not consonants", () => {
  // "Koimbatore" swaps a consonant, so it does not resolve. That is the
  // safe direction to fail in — a consonant swap can point at a genuinely
  // different district — but it does mean such a farmer gets the honest
  // "no district matching" message rather than their prices, and has to
  // correct the spelling on their farm record.
  const r = resolveLocation("Tamil Nadu", "Koimbatore", "Tomato");
  assert.equal(r.resolved, false);
  assert.equal(r.district, "");
});

test("a crop name is passed through verbatim, whatever it is", () => {
  for (const crop of ["Onion", "Potato", "Banana", "Bhindi(Ladies Finger)", "Paddy(Dhan)(Common)"]) {
    const r = resolveLocation("Tamil Nadu", "Madurai", crop);
    assert.equal(r.resolved, true);
    assert.equal(r.commodity, crop);
  }
});

// ---------------------------------------------------------- the mapping

function record(over: Record<string, unknown> = {}) {
  return {
    state: "Tamil Nadu",
    district: "Coimbatore",
    market: "Mettupalayam",
    commodity: "Tomato",
    variety: "Local",
    grade: "FAQ",
    arrival_date: "27/09/2026",
    min_price: 1200,
    max_price: 1800,
    modal_price: 1500,
    ...over
  };
}

test("maps records into the MarketSnapshot contract", () => {
  const r = mapAgmarknet({ records: [record()] }, RESOLVED, FIXED);
  assert.equal(r.status, "ok");
  if (r.status !== "ok") return;
  assert.equal(r.source, "agmarknet-data.gov.in");
  assert.equal(r.data.priceUnit, "INR_PER_QUINTAL");
  assert.equal(r.data.quotes.length, 1);
  assert.equal(r.data.quotes[0].market, "Mettupalayam");
  assert.equal(r.data.quotes[0].modalPrice, 1500);
  assert.equal(r.data.quotes[0].reportedOn, "2026-09-27");
  assert.equal(r.data.latestReportedOn, "2026-09-27");
});

test("an absent price is null, never 0 — a zero would read as free", () => {
  const r = mapAgmarknet(
    { records: [record({ min_price: null, max_price: undefined, modal_price: "" })] },
    RESOLVED, FIXED
  );
  assert.equal(r.status, "ok");
  if (r.status !== "ok") return;
  assert.equal(r.data.quotes[0].minPrice, null);
  assert.equal(r.data.quotes[0].maxPrice, null);
  assert.equal(r.data.quotes[0].modalPrice, null);
});

test("numeric strings are accepted without inventing anything", () => {
  const r = mapAgmarknet({ records: [record({ modal_price: "1500" })] }, RESOLVED, FIXED);
  assert.equal(r.status, "ok");
  if (r.status !== "ok") return;
  assert.equal(r.data.quotes[0].modalPrice, 1500);
});

test("an empty records array is unavailable, not an empty table", () => {
  const r = mapAgmarknet({ records: [] }, RESOLVED, FIXED);
  assert.equal(r.status, "unavailable");
  if (r.status !== "unavailable") return;
  assert.match(r.reason, /Tomato/);
  assert.match(r.reason, /Coimbatore/);
});

test("a row with no market name is dropped rather than shown blank", () => {
  const r = mapAgmarknet({ records: [record({ market: "  " }), record()] }, RESOLVED, FIXED);
  assert.equal(r.status, "ok");
  if (r.status !== "ok") return;
  assert.equal(r.data.quotes.length, 1);
});

test("records that are all unusable report unavailable", () => {
  const r = mapAgmarknet({ records: [record({ market: null }), null, "junk"] }, RESOLVED, FIXED);
  assert.equal(r.status, "unavailable");
});

test("quotes sort newest first, undated rows last", () => {
  const r = mapAgmarknet({
    records: [
      record({ market: "A", arrival_date: "25/09/2026" }),
      record({ market: "B", arrival_date: "bad" }),
      record({ market: "C", arrival_date: "27/09/2026" })
    ]
  }, RESOLVED, FIXED);
  assert.equal(r.status, "ok");
  if (r.status !== "ok") return;
  assert.deepEqual(r.data.quotes.map((q) => q.market), ["C", "A", "B"]);
  assert.equal(r.data.latestReportedOn, "2026-09-27");
});

test("an unreadable payload is unavailable rather than a crash", () => {
  assert.equal(mapAgmarknet("nonsense", RESOLVED, FIXED).status, "unavailable");
  assert.equal(mapAgmarknet(null, RESOLVED, FIXED).status, "unavailable");
  assert.equal(mapAgmarknet({}, RESOLVED, FIXED).status, "unavailable");
});

test("dates are parsed as DD/MM/YYYY, never handed to Date()", () => {
  assert.equal(toIsoDate("27/09/2026"), "2026-09-27");
  assert.equal(toIsoDate("09/27/2026"), null, "month 27 is rejected");
  assert.equal(toIsoDate("2026-09-27"), null);
  assert.equal(toIsoDate(""), null);
  assert.equal(toIsoDate(null), null);
});

test("the resolved names travel with the snapshot, not the farmer's spelling", () => {
  const r = mapAgmarknet({ records: [record()] },
    { state: "Tamil Nadu", district: "Thiruvellore", commodity: "Tomato" }, FIXED);
  assert.equal(r.status, "ok");
  if (r.status !== "ok") return;
  assert.equal(r.data.district, "Thiruvellore");
});
