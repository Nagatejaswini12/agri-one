import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

/**
 * Regression tests for the Crop Diagnosis label classifier.
 *
 * The contract has always declared four categories, but the agent could
 * only ever produce three: `pest` was unreachable, and the model's one
 * genuine arthropod class — the two-spotted spider mite — was filed as a
 * disease. A mite is an animal feeding on the plant, not a pathogen
 * infecting it, and Pest Activity reads `category === "pest"`, so before
 * this fix that page would have been empty forever.
 *
 * The classifier lives inside an n8n Code node and cannot be imported.
 * These tests read it straight out of the shipped source and evaluate
 * it, so what is asserted is exactly what n8n runs. `verify-diagnosis-
 * categories.mjs` separately proves that source matches the exported
 * workflow JSON and the live workflow.
 */

const SRC = "../../services/n8n/workflows/src/diagnosis/node-map-diagnosis-result.js";

/** The four values `DiagnosisCategory` declares. Nothing else may appear. */
const CATEGORIES = ["disease", "pest", "healthy", "inconclusive"] as const;
type Category = (typeof CATEGORIES)[number];

function extractClassifier(): (label: unknown) => Category {
  const src = fs.readFileSync(SRC, "utf8");
  const start = src.indexOf("const HEALTHY_PATTERN");
  assert.ok(start >= 0, "HEALTHY_PATTERN not found in the shipped source");
  const fnStart = src.indexOf("function categoriseLabel", start);
  assert.ok(fnStart >= 0, "categoriseLabel not found in the shipped source");
  const end = src.indexOf("\n}", fnStart) + 2;
  return new Function(
    `${src.slice(start, end)}; return categoriseLabel;`
  )() as (label: unknown) => Category;
}

const categoriseLabel = extractClassifier();

test("spider mites are a pest, not a disease", () => {
  // The exact class this model reports, in both export spellings.
  assert.equal(categoriseLabel("Tomato Spider mites Two-spotted spider mite"), "pest");
  assert.equal(categoriseLabel("Tomato___Spider_mites_Two-spotted_spider_mite"), "pest");
  assert.equal(categoriseLabel("Spider mites"), "pest");
  assert.equal(categoriseLabel("spider mite"), "pest");
});

test("underscores do not change the answer", () => {
  // `_` is a word character, so \bmites\b fails against "Spider_mites"
  // and the label falls through to "spotted" -> disease. The classifier
  // normalises separators first; this is what proves it still does.
  for (const [a, b] of [
    ["Tomato Spider mites Two-spotted spider mite", "Tomato___Spider_mites_Two-spotted_spider_mite"],
    ["Tomato Early blight", "Tomato___Early_blight"],
    ["Tomato healthy", "Tomato_healthy"],
    ["Tomato Bacterial spot", "Tomato___Bacterial_spot"]
  ]) {
    assert.equal(categoriseLabel(a), categoriseLabel(b), `${a} and ${b} disagree`);
  }
});

test("pest is decided before disease, or 'two-spotted' wins", () => {
  // The mite label literally contains "spotted". If the disease pattern
  // ran first, /spot/ would claim it and the fix would silently revert.
  assert.match("Tomato Spider mites Two-spotted spider mite", /spot/i);
  assert.equal(categoriseLabel("Tomato Spider mites Two-spotted spider mite"), "pest");
});

test("real disease labels are still diseases", () => {
  for (const label of [
    "Tomato Early blight",
    "Tomato Late blight",
    "Tomato Bacterial spot",
    "Tomato Septoria leaf spot",
    "Tomato Leaf Mold",
    "Tomato Target Spot",
    "Tomato Yellow Leaf Curl Virus",
    "Tomato mosaic virus"
  ]) {
    assert.equal(categoriseLabel(label), "disease", `${label} should be a disease`);
  }
});

test("healthy is still healthy, and wins over everything", () => {
  assert.equal(categoriseLabel("Tomato healthy"), "healthy");
  assert.equal(categoriseLabel("Tomato_healthy"), "healthy");
  // A healthy plant is healthy even if the class name mentions what it
  // was screened for — reporting that as an infestation would be a lie.
  assert.equal(categoriseLabel("healthy (no spider mites)"), "healthy");
});

test("an unrecognised label is inconclusive, never a guess", () => {
  for (const label of ["Tomato leaf", "Leaf", "Plant", "background", "unknown class 7"]) {
    assert.equal(categoriseLabel(label), "inconclusive", `${label} should be inconclusive`);
  }
});

test("unusable input is inconclusive rather than a crash or a finding", () => {
  for (const value of [null, undefined, "", "   ", 42, {}, [], true, NaN]) {
    assert.equal(
      categoriseLabel(value),
      "inconclusive",
      `${JSON.stringify(value) ?? String(value)} should be inconclusive`
    );
  }
});

test("other arthropods classify as pest, so a model swap cannot refile them", () => {
  // None of these are in the current 9 classes. They are covered so that
  // a broader model cannot quietly put an insect back under "disease".
  for (const label of [
    "Aphids",
    "aphid colony",
    "Whitefly",
    "Whiteflies on leaf",
    "Thrips damage",
    "Leaf miner",
    "Fruit borer",
    "Tomato hornworm",
    "Armyworm",
    "Mealybug"
  ]) {
    assert.equal(categoriseLabel(label), "pest", `${label} should be a pest`);
  }
});

test("every output is inside the DiagnosisCategory union", () => {
  const labels = [
    "Tomato Spider mites Two-spotted spider mite",
    "Tomato Early blight",
    "Tomato healthy",
    "Tomato leaf",
    "",
    "Aphids",
    "Whitefly",
    "Tomato___Target_Spot",
    "totally unknown",
    "12345"
  ];
  for (const label of labels) {
    assert.ok(
      (CATEGORIES as readonly string[]).includes(categoriseLabel(label)),
      `${label} produced a category outside the union`
    );
  }
  for (const value of [null, undefined, 0, {}, []]) {
    assert.ok((CATEGORIES as readonly string[]).includes(categoriseLabel(value)));
  }
});

test("the classifier names no chemical, dose or treatment", () => {
  const src = fs.readFileSync(SRC, "utf8");
  const BANNED = [
    "spray", "dosage", "pesticide", "fungicide", "insecticide", "herbicide",
    "kg/ha", "ml/l", "acaricide", "miticide",
    "urea", "dap", "mancozeb", "carbendazim", "imidacloprid", "abamectin",
    "glyphosate", "chlorpyrifos", "potash", "neem oil"
  ];
  const lower = src.toLowerCase();
  for (const word of BANNED) {
    assert.ok(!lower.includes(word), `the diagnosis node mentions "${word}"`);
  }
});

test("careGuidance is still never invented by this node", () => {
  // Roboflow returns a class and a score — no guidance of any kind. The
  // node must keep shipping empty arrays rather than filling them in.
  const src = fs.readFileSync(SRC, "utf8");
  assert.match(src, /culturalPractices:\s*\[\]/, "culturalPractices is no longer empty");
  assert.match(src, /monitoring:\s*\[\]/, "monitoring is no longer empty");
});
