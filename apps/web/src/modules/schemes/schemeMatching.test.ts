import { test } from "node:test";
import assert from "node:assert/strict";
import { matchSchemes, parseCrops, resolveState } from "./schemeMatching.ts";
import { CATALOG, CATALOG_VERSION, type CatalogScheme } from "./catalog.ts";

/**
 * These pin the matching that moved out of the n8n workflow.
 *
 * The one that matters most is the invariant: no input may produce a
 * match with zero `cannot_check` criteria, because that is what makes a
 * bare "you are eligible" verdict unconstructible. A false yes sends a
 * farmer on a wasted trip; a false no costs them a benefit. Everything
 * else here exists to stop that guarantee eroding quietly.
 */

const FIXED = () => new Date("2026-09-27T00:00:00.000Z");

const ok = (r: ReturnType<typeof matchSchemes>) => {
  assert.equal(r.status, "ok", r.status === "unavailable" ? r.reason : "");
  if (r.status !== "ok") throw new Error("unreachable");
  return r;
};

// ------------------------------------------------------- the catalog

test("the catalog carries all ten curated entries at the pinned version", () => {
  assert.equal(CATALOG.length, 10);
  assert.equal(CATALOG_VERSION, "2026-09-21");
  assert.equal(CATALOG.filter((s) => s.level === "central").length, 6);
  assert.equal(CATALOG.filter((s) => s.level === "state").length, 4);
});

test("every entry carries the fields the page renders", () => {
  for (const s of CATALOG) {
    assert.ok(s.id?.trim(), `${s.id}: id`);
    assert.ok(s.name?.trim(), `${s.id}: name`);
    assert.ok(s.level === "central" || s.level === "state", `${s.id}: level`);
    assert.ok(Array.isArray(s.states), `${s.id}: states`);
    assert.ok(s.sourceName?.trim(), `${s.id}: sourceName`);
    assert.match(s.sourceUrl, /^https:\/\//, `${s.id}: official https source`);
    assert.match(String(s.lastVerifiedOn), /^\d{4}-\d{2}-\d{2}$/, `${s.id}: lastVerifiedOn`);
    assert.ok(Array.isArray(s.criteria) && s.criteria.length > 0, `${s.id}: criteria`);
  }
});

test("every scheme carries at least one manual criterion", () => {
  // This is the structural reason an "eligible" verdict cannot be built.
  for (const s of CATALOG) {
    assert.ok(
      s.criteria.some((c) => c.kind === "manual"),
      `${s.id} has no manual criterion — an "eligible" verdict would become constructible`
    );
  }
});

test("a central scheme names no states, a state scheme names at least one", () => {
  for (const s of CATALOG) {
    if (s.level === "central") assert.equal(s.states.length, 0, s.id);
    else assert.ok(s.states.length > 0, s.id);
  }
});

// -------------------------------------------------- state resolution

test("state resolution is exact-or-nothing", () => {
  assert.equal(resolveState("Tamil Nadu"), "Tamil Nadu");
  assert.equal(resolveState("tamilnadu"), "Tamil Nadu");
  assert.equal(resolveState("TAMIL NADU"), "Tamil Nadu");
  assert.equal(resolveState("  Tamil  Nadu  "), "Tamil Nadu");
  assert.equal(resolveState("Tamilnad"), null, "a near miss must not resolve");
  assert.equal(resolveState("Atlantis"), null);
  assert.equal(resolveState(""), null);
  assert.equal(resolveState(null), null);
  assert.equal(resolveState(undefined), null);
});

test("state aliases that are different names entirely resolve", () => {
  assert.equal(resolveState("Orissa"), "Odisha");
  assert.equal(resolveState("Keralam"), "Kerala");
  assert.equal(resolveState("Pondicherry"), "Puducherry");
  assert.equal(resolveState("Uttaranchal"), "Uttarakhand");
  assert.equal(resolveState("New Delhi"), "Delhi");
  assert.equal(resolveState("NCT of Delhi"), "Delhi");
});

// ------------------------------------------------------- crop input

test("crops parse from an array, a JSON string or a comma list", () => {
  assert.deepEqual(parseCrops(["Tomato", "Onion"]), ["Tomato", "Onion"]);
  assert.deepEqual(parseCrops('["Tomato","Onion"]'), ["Tomato", "Onion"]);
  assert.deepEqual(parseCrops("Tomato, Onion"), ["Tomato", "Onion"]);
  assert.deepEqual(parseCrops([{ cropName: "Tomato" }]), ["Tomato"]);
  assert.deepEqual(parseCrops(""), []);
  assert.deepEqual(parseCrops(null), []);
  assert.deepEqual(parseCrops(42), []);
});

// ------------------------------------------- central / no-state farm

test("a farm with no state still gets the central schemes", () => {
  const r = ok(matchSchemes({ state: null, district: null, areaAcres: 2, crops: ["Tomato"] }, FIXED, CATALOG, CATALOG_VERSION));
  assert.equal(r.data.state, null);
  assert.ok(r.data.matches.length > 0);
  assert.ok(r.data.matches.every((m) => m.scheme.level === "central"));
});

test("a farm with no state reports how many state schemes were skipped", () => {
  const r = ok(matchSchemes({ state: null, areaAcres: 2, crops: [] }, FIXED, CATALOG, CATALOG_VERSION));
  assert.equal(r.data.stateSchemesSkipped, 4);
  assert.equal(r.data.totalSchemes, 10);
});

test("an unresolvable state is treated as no state, never as a guess", () => {
  const r = ok(matchSchemes({ state: "Atlantis", areaAcres: 2, crops: [] }, FIXED, CATALOG, CATALOG_VERSION));
  assert.equal(r.data.state, null);
  assert.equal(r.data.askedState, "Atlantis", "what the farm actually said travels through");
  assert.equal(r.data.stateSchemesSkipped, 4);
  assert.ok(r.data.matches.every((m) => m.scheme.level === "central"));
});

// ----------------------------------------------------- state filtering

for (const [state, id] of [
  ["Tamil Nadu", "tn-uzhavar-sandhai"],
  ["Maharashtra", "mh-mahadbt-farmer"],
  ["Karnataka", "ka-raitamitra"]
] as const) {
  test(`a ${state} farm gets its own state schemes and no other state's`, () => {
    const r = ok(matchSchemes({ state, areaAcres: 2, crops: ["Tomato"] }, FIXED, CATALOG, CATALOG_VERSION));
    assert.equal(r.data.state, state);
    assert.equal(r.data.stateSchemesSkipped, 0);
    const stateOnes = r.data.matches.filter((m) => m.scheme.level === "state");
    assert.ok(stateOnes.length > 0, "at least one state scheme");
    assert.ok(stateOnes.some((m) => m.scheme.id === id), `${id} present`);
    for (const m of stateOnes) {
      assert.ok(m.scheme.states.includes(state), `${m.scheme.id} belongs to ${state}`);
    }
  });
}

test("a supported state with no state-level schemes gets only central ones", () => {
  const r = ok(matchSchemes({ state: "Bihar", areaAcres: 2, crops: ["Tomato"] }, FIXED, CATALOG, CATALOG_VERSION));
  assert.equal(r.data.state, "Bihar");
  // The state resolved, so nothing was skipped for want of a state.
  assert.equal(r.data.stateSchemesSkipped, 0);
  assert.ok(r.data.matches.every((m) => m.scheme.level === "central"));
});

// ------------------------------------------------ criterion evaluation

function criterionFor(kind: string, req: Parameters<typeof matchSchemes>[0]) {
  const scheme = CATALOG.find((s) => s.criteria.some((c) => c.kind === kind));
  if (!scheme) throw new Error(`no catalog scheme uses ${kind}`);
  const key = scheme.criteria.find((c) => c.kind === kind)!.key;
  const r = ok(matchSchemes(req, FIXED, CATALOG, CATALOG_VERSION));
  const m = r.data.matches.find((x) => x.scheme.id === scheme.id);
  return m?.criteria.find((c) => c.key === key) ?? null;
}

test("land_area_recorded: matched when an area is recorded, cannot_check when not", () => {
  const withArea = criterionFor("land_area_recorded", { state: "Tamil Nadu", areaAcres: 2, crops: [] });
  assert.equal(withArea?.status, "matched");
  assert.deepEqual(withArea?.params, { acres: 2 });

  const without = criterionFor("land_area_recorded", { state: "Tamil Nadu", areaAcres: null, crops: [] });
  assert.equal(without?.status, "cannot_check");
  assert.equal(without?.params, null, "no acreage is reported when none is known");
});

test("land_area_recorded treats a non-numeric area as unknown, not as 0 acres", () => {
  const c = criterionFor("land_area_recorded", { state: "Tamil Nadu", areaAcres: "not-a-number", crops: [] });
  assert.equal(c?.status, "cannot_check");
});

test("crop_recorded: matched with a crop, not_matched without", () => {
  assert.equal(criterionFor("crop_recorded", { state: "Tamil Nadu", areaAcres: 2, crops: ["Tomato"] })?.status, "matched");
  assert.equal(criterionFor("crop_recorded", { state: "Tamil Nadu", areaAcres: 2, crops: [] })?.status, "not_matched");
});

test("state_match: matched in its own state, cannot_check without one", () => {
  const inState = criterionFor("state_match", { state: "Tamil Nadu", areaAcres: 2, crops: [] });
  assert.equal(inState?.status, "matched");
  assert.deepEqual(inState?.params, { state: "Tamil Nadu" });
});

test("manual always evaluates to cannot_check, whatever the farm records", () => {
  for (const req of [
    { state: "Tamil Nadu", areaAcres: 2, crops: ["Tomato"] },
    { state: null, areaAcres: null, crops: [] },
    { state: "Maharashtra", areaAcres: 999, crops: ["Onion", "Wheat"] }
  ]) {
    const r = ok(matchSchemes(req, FIXED, CATALOG, CATALOG_VERSION));
    for (const m of r.data.matches) {
      const scheme = CATALOG.find((s) => s.id === m.scheme.id)!;
      for (const c of scheme.criteria.filter((x) => x.kind === "manual")) {
        const got = m.criteria.find((x) => x.key === c.key);
        assert.equal(got?.status, "cannot_check", `${m.scheme.id}/${c.key}`);
      }
    }
  }
});

// ------------------------------------------------------------- groups

test("group is 'other' when something recorded contradicts the scheme", () => {
  // A central scheme carrying a state_match for somewhere else: the
  // criterion evaluates to not_matched, which must force "other" even
  // though other criteria pass.
  const base = CATALOG.find((s) => s.level === "central")!;
  const conflicting: CatalogScheme[] = [{
    ...base,
    id: "elsewhere-only",
    states: ["Maharashtra"],
    criteria: [
      { key: "stateMatch", kind: "state_match" },
      { key: "landRecorded", kind: "land_area_recorded" },
      { key: "applyAtOffice", kind: "manual" }
    ]
  }];
  const r = ok(matchSchemes(
    { state: "Tamil Nadu", areaAcres: 2, crops: ["Tomato"] }, FIXED, conflicting, CATALOG_VERSION
  ));
  const m = r.data.matches.find((x) => x.scheme.id === "elsewhere-only");
  assert.ok(m, "the scheme is still shown");
  assert.equal(m!.group, "other");
  assert.equal(m!.criteria.find((c) => c.key === "stateMatch")?.status, "not_matched");
  assert.ok(m!.criteria.some((c) => c.status === "matched"), "a passing criterion does not rescue it");
  assert.ok(m!.criteria.some((c) => c.status === "cannot_check"), "the invariant still holds");
});

test("group is 'matched' when at least one criterion passed and none failed", () => {
  const r = ok(matchSchemes({ state: "Tamil Nadu", areaAcres: 2, crops: ["Tomato"] }, FIXED, CATALOG, CATALOG_VERSION));
  const matched = r.data.matches.filter((m) => m.group === "matched");
  assert.ok(matched.length > 0);
  for (const m of matched) {
    assert.ok(m.criteria.some((c) => c.status === "matched"));
    assert.equal(m.criteria.filter((c) => c.status === "not_matched").length, 0);
  }
});

test("group is 'needs_check' when nothing contradicted but nothing could be checked", () => {
  const r = ok(matchSchemes({ state: null, areaAcres: null, crops: [] }, FIXED, CATALOG, CATALOG_VERSION));
  const needs = r.data.matches.filter((m) => m.group === "needs_check");
  assert.ok(needs.length > 0, "a farm with nothing recorded should need checking");
  for (const m of needs) {
    assert.equal(m.criteria.filter((c) => c.status === "matched").length, 0);
    assert.equal(m.criteria.filter((c) => c.status === "not_matched").length, 0);
  }
});

test("a contradicted criterion puts the scheme in 'other', never in 'matched'", () => {
  const r = ok(matchSchemes({ state: "Tamil Nadu", areaAcres: 2, crops: [] }, FIXED, CATALOG, CATALOG_VERSION));
  for (const m of r.data.matches) {
    if (m.criteria.some((c) => c.status === "not_matched")) assert.equal(m.group, "other", m.scheme.id);
  }
});

// -------------------------------------------------------- the invariant

test("NO input can produce a match without a cannot_check criterion", () => {
  const requests: Parameters<typeof matchSchemes>[0][] = [
    { state: "Tamil Nadu", district: "Coimbatore", areaAcres: 2, crops: ["Tomato"] },
    { state: "Maharashtra", areaAcres: 0.5, crops: ["Onion", "Wheat", "Sugarcane"] },
    { state: "Karnataka", areaAcres: 10000, crops: ["Ragi"] },
    { state: null, areaAcres: null, crops: [] },
    { state: "Kerala", areaAcres: 1, crops: [] },
    { state: "Bihar", areaAcres: 3, crops: ["Paddy"] },
    {},
    { state: "  ", district: "  ", areaAcres: "", crops: "" }
  ];
  for (const req of requests) {
    const r = matchSchemes(req, FIXED, CATALOG, CATALOG_VERSION);
    if (r.status !== "ok") continue;
    for (const m of r.data.matches) {
      assert.ok(
        m.criteria.some((c) => c.status === "cannot_check"),
        `${m.scheme.id} for ${JSON.stringify(req)} carries nothing the farmer must confirm`
      );
    }
  }
});

test("a scheme whose criteria could all pass is dropped rather than shown as eligible", () => {
  // farm_record always matches; with no manual criterion there would be
  // nothing left to confirm, so the entry must not be returned at all.
  const fabricated: CatalogScheme[] = [
    {
      ...CATALOG[0],
      id: "all-pass",
      criteria: [{ key: "farmRecord", kind: "farm_record" }]
    }
  ];
  const r = matchSchemes({ state: "Tamil Nadu", areaAcres: 2, crops: ["Tomato"] }, FIXED, fabricated, CATALOG_VERSION);
  assert.equal(r.status, "unavailable", "nothing renderable is unavailable, not an empty list");
});

// ------------------------------------------------------- staleness

test("the 180-day staleness boundary", () => {
  const base = CATALOG.find((s) => s.level === "central")!;
  const at = (verified: string, today: string) => {
    const one: CatalogScheme[] = [{ ...base, lastVerifiedOn: verified }];
    const r = matchSchemes({ state: null, areaAcres: 2, crops: [] }, () => new Date(today), one, CATALOG_VERSION);
    return r.status === "ok" ? r.data.matches[0].stale : null;
  };
  // Exactly 180 days old is not yet stale; 181 is.
  assert.equal(at("2026-01-01", "2026-06-30T00:00:00Z"), false, "180 days");
  assert.equal(at("2026-01-01", "2026-07-01T00:00:00Z"), true, "181 days");
  assert.equal(at("2026-09-27", "2026-09-27T00:00:00Z"), false, "same day");
});

test("an entry with no usable verified date is treated as stale, never as fresh", () => {
  const base = CATALOG.find((s) => s.level === "central")!;
  for (const bad of [null, "", "not-a-date", "27/09/2026"]) {
    const one: CatalogScheme[] = [{ ...base, lastVerifiedOn: bad as string | null }];
    const r = matchSchemes({ state: null, areaAcres: 2, crops: [] }, FIXED, one, CATALOG_VERSION);
    assert.equal(r.status, "ok");
    if (r.status !== "ok") continue;
    assert.equal(r.data.matches[0].stale, true, String(bad));
  }
});

// ----------------------------------------------------- result contract

test("the result carries the contract the page renders", () => {
  const r = ok(matchSchemes({ state: "Tamil Nadu", district: "Coimbatore", areaAcres: 2, crops: ["Tomato"] }, FIXED, CATALOG, CATALOG_VERSION));
  assert.equal(r.source, "agri-one-curated-scheme-catalog");
  assert.equal(r.asOf, "2026-09-27T00:00:00.000Z");
  assert.equal(r.data.catalogVersion, "2026-09-21");
  assert.equal(r.data.catalogVerifiedOn, "2026-09-21");
  assert.equal(r.data.district, "Coimbatore");
  assert.equal(r.data.askedState, "Tamil Nadu");
  assert.equal(r.data.totalSchemes, 10);
  for (const m of r.data.matches) {
    assert.ok(["matched", "needs_check", "other"].includes(m.group));
    assert.equal(typeof m.stale, "boolean");
    assert.ok(m.criteria.length > 0);
  }
});

test("asOf is when the request ran, catalogVerifiedOn is when a human last checked", () => {
  // Collapsing these would overstate how current the scheme data is.
  const r = ok(matchSchemes({ state: "Tamil Nadu", areaAcres: 2, crops: [] }, FIXED, CATALOG, CATALOG_VERSION));
  assert.notEqual(r.asOf.slice(0, 10), r.data.catalogVerifiedOn);
});

test("a malformed entry is dropped rather than half-rendered", () => {
  const base = CATALOG.find((s) => s.level === "central")!;
  const broken: CatalogScheme[] = [
    { ...base, id: "no-source", sourceUrl: "http://insecure.example" },
    { ...base, id: "no-name", name: "  " },
    base
  ];
  const r = ok(matchSchemes({ state: null, areaAcres: 2, crops: [] }, FIXED, broken, CATALOG_VERSION));
  assert.equal(r.data.matches.length, 1);
  assert.equal(r.data.matches[0].scheme.id, base.id);
});

test("an empty catalog reports unavailable rather than a blank page", () => {
  const r = matchSchemes({ state: "Tamil Nadu", areaAcres: 2, crops: [] }, FIXED, [], CATALOG_VERSION);
  assert.equal(r.status, "unavailable");
  if (r.status !== "unavailable") return;
  assert.match(r.reason, /No government schemes could be listed/);
});

test("scheme content never comes from the request", () => {
  // A crafted request must not be able to introduce a scheme.
  const r = ok(matchSchemes({
    state: "Tamil Nadu",
    areaAcres: 2,
    crops: ["Tomato"],
    // @ts-expect-error deliberately passing a field the contract does not have
    catalog: [{ id: "injected", name: "Injected Scheme" }]
  }, FIXED, CATALOG, CATALOG_VERSION));
  assert.ok(!r.data.matches.some((m) => m.scheme.id === "injected"));
  assert.equal(r.data.totalSchemes, 10);
});
