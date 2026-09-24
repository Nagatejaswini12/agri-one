import assert from "node:assert/strict";
import test from "node:test";
import { OFFICIAL_PEST_RESOURCES, resourcesForState } from "./officialResources.ts";

/**
 * This list is the only place Pest Activity points a farmer outward, so
 * the bar is the same as the scheme catalog: every link official, every
 * link checked by a person on a stated date, and nothing in the copy
 * that reads as treatment advice from AGRI ONE.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

test("every resource links to an official government or ICAR address over https", () => {
  assert.ok(OFFICIAL_PEST_RESOURCES.length > 0);
  for (const r of OFFICIAL_PEST_RESOURCES) {
    assert.match(r.sourceUrl, /^https:\/\//, `${r.id} is not https`);
    assert.match(
      r.sourceUrl,
      /\.(gov\.in|nic\.in|icar\.gov\.in|res\.in)(\/|$)/,
      `${r.id} is not an official address`
    );
  }
});

test("every resource carries a real verification date, not a future one", () => {
  const today = new Date().toISOString().slice(0, 10);
  for (const r of OFFICIAL_PEST_RESOURCES) {
    assert.match(r.lastVerifiedOn, ISO_DATE, `${r.id} has no usable lastVerifiedOn`);
    assert.ok(
      r.lastVerifiedOn <= today,
      `${r.id} claims it was verified on ${r.lastVerifiedOn}, which is in the future`
    );
  }
});

test("no resource names a chemical, dose or treatment", () => {
  // The same banned list the chat templates are held to. A description
  // here is still AGRI ONE speaking.
  const BANNED = [
    "spray", "dosage", "dose", "pesticide", "fungicide", "insecticide", "herbicide",
    "acaricide", "miticide", "kg/ha", "ml/l", "per hectare", "apply ",
    "urea", "dap", "mancozeb", "carbendazim", "imidacloprid", "abamectin",
    "glyphosate", "chlorpyrifos", "neem oil"
  ];
  for (const r of OFFICIAL_PEST_RESOURCES) {
    const text = `${r.name} ${r.purpose} ${r.sourceName}`.toLowerCase();
    const hit = BANNED.find((w) => text.includes(w));
    assert.equal(hit, undefined, `${r.id} mentions "${hit}"`);
  }
});

test("no resource predicts risk or tells the farmer to act", () => {
  for (const r of OFFICIAL_PEST_RESOURCES) {
    const text = `${r.name} ${r.purpose}`.toLowerCase();
    for (const word of ["risk", "forecast", "predict", "likely", "act now", "urgent", "outbreak expected"]) {
      assert.ok(!text.includes(word), `${r.id} mentions "${word}"`);
    }
  }
});

test("no resource carries buyer, trader or private contact data", () => {
  const serialized = JSON.stringify(OFFICIAL_PEST_RESOURCES);
  assert.ok(!/buyer|trader|@|\+91|\b\d{10}\b/i.test(serialized));
});

test("every entry has exactly the declared shape", () => {
  for (const r of OFFICIAL_PEST_RESOURCES) {
    assert.deepEqual(Object.keys(r).sort(), [
      "id",
      "lastVerifiedOn",
      "name",
      "purpose",
      "sourceName",
      "sourceUrl",
      "states"
    ]);
    assert.ok(Array.isArray(r.states));
    assert.ok(r.purpose.length > 30, `${r.id} has a uselessly short purpose`);
  }
});

test("ids are unique", () => {
  const ids = OFFICIAL_PEST_RESOURCES.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("national resources apply to every state, including unknown ones", () => {
  const national = OFFICIAL_PEST_RESOURCES.filter((r) => r.states.length === 0);
  assert.ok(national.length > 0, "there is no national resource at all");
  for (const state of ["Tamil Nadu", "Kerala", "Bihar", "Punjab", "Assam", "Nagaland"]) {
    const got = resourcesForState(state).map((r) => r.id);
    for (const r of national) {
      assert.ok(got.includes(r.id), `${r.id} is missing for ${state}`);
    }
  }
});

test("a state resource shows only in its own state", () => {
  const tn = resourcesForState("Tamil Nadu").map((r) => r.id);
  assert.ok(tn.includes("tn-agrisnet"));
  for (const state of ["Kerala", "Bihar", "Punjab", "Maharashtra"]) {
    assert.ok(
      !resourcesForState(state).map((r) => r.id).includes("tn-agrisnet"),
      `the Tamil Nadu resource leaked into ${state}`
    );
  }
});

test("state matching is case- and whitespace-insensitive", () => {
  const expected = resourcesForState("Tamil Nadu").map((r) => r.id);
  for (const variant of ["tamil nadu", "TAMIL NADU", "  Tamil Nadu  "]) {
    assert.deepEqual(resourcesForState(variant).map((r) => r.id), expected, variant);
  }
});

test("a farm with no state still gets the national resources", () => {
  // Pest information is not location-gated the way a selling venue is —
  // a farmer with no district saved still deserves the national portal.
  for (const value of [null, undefined, "", "   "]) {
    const got = resourcesForState(value);
    assert.ok(got.length > 0, `${JSON.stringify(value)} returned nothing`);
    assert.ok(got.every((r) => r.states.length === 0), "a state resource leaked in");
  }
});
