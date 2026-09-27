import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AMBIGUOUS_MARGIN,
  HIGH_THRESHOLD,
  INCONCLUSIVE_THRESHOLD,
  categoriseLabel,
  diagnosisUnavailable,
  mapRoboflow
} from "./roboflow.ts";

/**
 * These pin the classifier and mapper that moved out of the n8n
 * workflow.
 *
 * The one that matters most is that `pest` stays reachable. It was
 * unreachable for three phases: the model's only arthropod class
 * contains "spotted", the disease pattern matches /spot/, and disease
 * was tested first — so a mite was filed as a pathogen and Pest Activity
 * showed an empty list forever while calling it "no pest activity".
 *
 * The second is that no chemical, product or dose is ever emitted. The
 * agent names what was seen and nothing more.
 */

const FIXED = () => new Date("2026-09-27T00:00:00.000Z");
const ok = (r: ReturnType<typeof mapRoboflow>) => {
  assert.equal(r.status, "ok", r.status === "unavailable" ? r.reason : "");
  if (r.status !== "ok") throw new Error("unreachable");
  return r;
};
const predict = (...ps: [string, number][]) => ({
  predictions: ps.map(([c, confidence]) => ({ class: c, confidence }))
});

// -------------------------------------------------- the classifier

test("every one of the model's nine classes lands in a declared category", () => {
  const CLASSES = [
    "Tomato Bacterial spot",
    "Tomato Early blight",
    "Tomato Late blight",
    "Tomato Leaf Mold",
    "Tomato Septoria leaf spot",
    "Tomato Spider mites Two-spotted spider mite",
    "Tomato Target Spot",
    "Tomato Yellow Leaf Curl Virus",
    "Tomato healthy"
  ];
  for (const c of CLASSES) {
    assert.ok(
      ["disease", "pest", "healthy", "inconclusive"].includes(categoriseLabel(c)),
      `${c} -> ${categoriseLabel(c)}`
    );
  }
});

test("pest is reachable — the mite class is a pest, not a disease", () => {
  assert.equal(categoriseLabel("Tomato Spider mites Two-spotted spider mite"), "pest");
});

test("the underscore spelling classifies identically to the spaced one", () => {
  // An underscore is a word character, so \bmites\b silently fails
  // against this form and the label used to fall through to "spotted".
  for (const pair of [
    ["Tomato Spider mites Two-spotted spider mite", "Tomato___Spider_mites_Two-spotted_spider_mite"],
    ["Tomato Early blight", "Tomato___Early_blight"],
    ["Tomato healthy", "Tomato_healthy"],
    ["Tomato Bacterial spot", "Tomato___Bacterial_spot"]
  ]) {
    assert.equal(categoriseLabel(pair[0]), categoriseLabel(pair[1]), pair[1]);
  }
});

test("healthy wins over everything, even when other words are present", () => {
  assert.equal(categoriseLabel("Tomato healthy"), "healthy");
  assert.equal(categoriseLabel("Tomato_healthy"), "healthy");
});

test("pathogen classes are diseases", () => {
  for (const c of [
    "Tomato Early blight", "Tomato Late blight", "Tomato Bacterial spot",
    "Tomato Septoria leaf spot", "Tomato Leaf Mold", "Tomato Target Spot",
    "Tomato Yellow Leaf Curl Virus", "Tomato mosaic virus"
  ]) {
    assert.equal(categoriseLabel(c), "disease", c);
  }
});

test("other arthropods stay pests, so a broader model cannot refile them", () => {
  for (const c of ["aphids", "whitefly", "whiteflies", "thrips", "stem borer",
                   "leaf miner", "caterpillar", "armyworm", "hornworm", "bollworm", "mealybug"]) {
    assert.equal(categoriseLabel(c), "pest", c);
  }
});

test("a label that names no condition is inconclusive, never guessed", () => {
  for (const c of ["Tomato leaf", "Leaf", "Plant", "background", "unknown class 7", "", "   "]) {
    assert.equal(categoriseLabel(c), "inconclusive", JSON.stringify(c));
  }
  assert.equal(categoriseLabel(null), "inconclusive");
  assert.equal(categoriseLabel(42), "inconclusive");
});

// ------------------------------------------------------ thresholds

test("below the inconclusive threshold nothing is claimed", () => {
  const below = ok(mapRoboflow(predict(["Tomato Early blight", INCONCLUSIVE_THRESHOLD - 0.001]), null, FIXED));
  assert.equal(below.data.primaryFinding.category, "inconclusive");
  assert.equal(below.data.primaryFinding.label, "Inconclusive");
  assert.equal(below.data.recommendExpertConsult, true);

  const at = ok(mapRoboflow(predict(["Tomato Early blight", INCONCLUSIVE_THRESHOLD]), null, FIXED));
  assert.equal(at.data.primaryFinding.category, "disease", "exactly at the threshold reports");
});

test("a moderate score reports the finding but asks for an expert", () => {
  const r = ok(mapRoboflow(predict(["Tomato Early blight", HIGH_THRESHOLD - 0.001]), null, FIXED));
  assert.equal(r.data.primaryFinding.category, "disease");
  assert.equal(r.data.recommendExpertConsult, true);
  assert.match(String(r.data.expertConsultReason), /moderate/i);
});

test("a high score reports without demanding an expert", () => {
  const r = ok(mapRoboflow(predict(["Tomato Early blight", HIGH_THRESHOLD]), null, FIXED));
  assert.equal(r.data.recommendExpertConsult, false);
  assert.equal(r.data.expertConsultReason, null);
  assert.equal(r.data.confidenceLevel, "high");
});

test("confidenceLevel follows the same two thresholds", () => {
  const level = (c: number) => ok(mapRoboflow(predict(["Tomato Early blight", c]), null, FIXED)).data.confidenceLevel;
  assert.equal(level(HIGH_THRESHOLD), "high");
  assert.equal(level(HIGH_THRESHOLD - 0.001), "medium");
  assert.equal(level(INCONCLUSIVE_THRESHOLD), "medium");
  assert.equal(level(INCONCLUSIVE_THRESHOLD - 0.001), "low");
});

// ------------------------------------------------------- ambiguity

test("two different classes within the margin report nothing", () => {
  const r = ok(mapRoboflow(
    predict(["Tomato Early blight", 0.80], ["Tomato Late blight", 0.80 - (AMBIGUOUS_MARGIN - 0.001)]),
    null, FIXED
  ));
  assert.equal(r.data.primaryFinding.category, "inconclusive");
  assert.match(String(r.data.expertConsultReason), /similar confidence/i);
});

test("outside the margin the stronger class is reported", () => {
  const r = ok(mapRoboflow(
    predict(["Tomato Early blight", 0.90], ["Tomato Late blight", 0.90 - AMBIGUOUS_MARGIN]),
    null, FIXED
  ));
  assert.equal(r.data.primaryFinding.label, "Tomato Early blight");
});

test("repeated boxes of the SAME class are not a competing diagnosis", () => {
  // Object detection returns one box per detection; three boxes of one
  // class is agreement, not ambiguity.
  const r = ok(mapRoboflow(
    predict(["Tomato Early blight", 0.82], ["Tomato Early blight", 0.81], ["Tomato Early blight", 0.80]),
    null, FIXED
  ));
  assert.equal(r.data.primaryFinding.category, "disease");
  assert.deepEqual(r.data.alternativePossibilities, [], "same class is never an alternative");
});

// ------------------------------------------------ empty / unusable

test("no predictions is inconclusive, never a guessed label", () => {
  const r = ok(mapRoboflow({ predictions: [] }, null, FIXED));
  assert.equal(r.data.primaryFinding.category, "inconclusive");
  assert.equal(r.data.primaryFinding.confidence, 0);
  assert.equal(r.data.recommendExpertConsult, true);
});

test("malformed predictions are dropped rather than half-read", () => {
  const r = ok(mapRoboflow({
    predictions: [
      { class: "", confidence: 0.9 },
      { class: "Tomato Early blight", confidence: "high" },
      null,
      { class: "Tomato Early blight", confidence: 0.9 }
    ]
  }, null, FIXED));
  assert.equal(r.data.primaryFinding.label, "Tomato Early blight");
  assert.equal(r.data.alternativePossibilities.length, 0);
});

test("an unreadable body is inconclusive rather than a crash", () => {
  for (const body of [null, "nonsense", 42, {}, { predictions: "no" }]) {
    const r = ok(mapRoboflow(body, null, FIXED));
    assert.equal(r.data.primaryFinding.category, "inconclusive");
  }
});

// -------------------------------------------------- alternatives

test("alternatives are other classes only, capped at three, each categorised", () => {
  const r = ok(mapRoboflow(
    predict(
      ["Tomato Early blight", 0.95],
      ["Tomato Spider mites Two-spotted spider mite", 0.40],
      ["Tomato Leaf Mold", 0.30],
      ["Tomato healthy", 0.20],
      ["Tomato Target Spot", 0.10]
    ), null, FIXED
  ));
  assert.equal(r.data.alternativePossibilities.length, 3);
  assert.equal(r.data.alternativePossibilities[0].category, "pest", "a mite alternative is still a pest");
  assert.ok(r.data.alternativePossibilities.every((a) => a.label !== "Tomato Early blight"));
});

test("an inconclusive primary carries no alternatives", () => {
  const r = ok(mapRoboflow(predict(["Tomato leaf", 0.9], ["Tomato Leaf Mold", 0.2]), null, FIXED));
  assert.equal(r.data.primaryFinding.category, "inconclusive");
  assert.deepEqual(r.data.alternativePossibilities, []);
});

// ------------------------------------------------------ the contract

test("cropName is echoed from the farm record, never inferred", () => {
  assert.equal(ok(mapRoboflow(predict(["Tomato healthy", 0.9]), "Tomato", FIXED)).data.cropName, "Tomato");
  assert.equal(ok(mapRoboflow(predict(["Tomato healthy", 0.9]), null, FIXED)).data.cropName, null);
});

test("the result carries the contract the page renders", () => {
  const r = ok(mapRoboflow(predict(["Tomato Early blight", 0.9]), "Tomato", FIXED));
  assert.equal(r.source, "roboflow-crop-disease-axhjj-v1");
  assert.equal(r.asOf, "2026-09-27T00:00:00.000Z");
  assert.equal(r.data.modelInfo.provider, "roboflow");
  assert.equal(r.data.modelInfo.ranAt, "2026-09-27T00:00:00.000Z");
  assert.match(r.data.disclaimer, /indicative only/i);
  assert.deepEqual(r.data.visualEvidence, []);
});

test("an unavailable result carries a reason and no findings", () => {
  const r = diagnosisUnavailable("The diagnosis service is currently unavailable.");
  assert.equal(r.status, "unavailable");
  if (r.status !== "unavailable") return;
  assert.match(r.reason, /unavailable/i);
  assert.ok(!("data" in r));
});

// ------------------------------------------- the no-chemical invariant

test("NO input produces a chemical, product, pesticide or dose", () => {
  const BANNED =
    /pesticide|insecticide|fungicide|herbicide|spray|chemical|dose|dosage|\bml\b|\bmg\b|\bkg\/ha\b|imidacloprid|mancozeb|carbendazim|neem oil|copper oxychloride/i;
  const inputs: [string, number][][] = [
    [["Tomato Early blight", 0.95]],
    [["Tomato Spider mites Two-spotted spider mite", 0.92]],
    [["Tomato healthy", 0.99]],
    [["Tomato leaf", 0.88]],
    [["Tomato Late blight", 0.41], ["Tomato Early blight", 0.40]],
    [["Tomato Yellow Leaf Curl Virus", 0.30]]
  ];
  for (const ps of inputs) {
    const r = mapRoboflow(predict(...ps), "Tomato", FIXED);
    const text = JSON.stringify(r);
    assert.ok(!BANNED.test(text), `chemical guidance leaked for ${JSON.stringify(ps)}`);
    if (r.status === "ok") {
      assert.deepEqual(r.data.careGuidance.culturalPractices, [], "careGuidance is never populated");
      assert.deepEqual(r.data.careGuidance.monitoring, []);
    }
  }
});

test("every finding reports the model's own score, never a rounded claim", () => {
  const r = ok(mapRoboflow(predict(["Tomato Early blight", 0.8137]), null, FIXED));
  assert.equal(r.data.primaryFinding.confidence, 0.8137);
});
