import assert from "node:assert/strict";
import test from "node:test";
import type { FarmCrop, Scan } from "@agri-one/shared-types";
import { DEFAULT_WINDOW_DAYS, selectPestActivity } from "./selectPestActivity.ts";

/**
 * Pest Activity reports sightings, not risk. These tests exist to keep
 * it that way: only the farmer's own pest-classified scans appear, the
 * model's own numbers pass through unchanged, and a malformed row is
 * dropped rather than rendered as a blank sighting on someone's farm.
 */

const NOW = new Date("2026-09-24T12:00:00.000Z");

function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();
}

const CROPS: FarmCrop[] = [
  {
    id: "crop-1",
    farmId: "farm-1",
    cropName: "Tomato",
    variety: null,
    sowingDate: null,
    currentStage: null,
    status: "active"
  },
  {
    id: "crop-2",
    farmId: "farm-1",
    cropName: "Onion",
    variety: null,
    sowingDate: null,
    currentStage: null,
    status: "active"
  }
];

/** A scan shaped exactly like a real row, with the parts under test overridable. */
function scan(
  id: string,
  category: string,
  createdAt: string,
  extra: Record<string, unknown> = {},
  cropId = "crop-1"
): Scan {
  return {
    id,
    farmId: "farm-1",
    cropId,
    imageUrl: `scans/${id}.jpg`,
    confidence: 0.8,
    createdAt,
    diagnosisResult: {
      cropName: "Tomato",
      primaryFinding: {
        label: "Tomato Spider mites Two-spotted spider mite",
        category,
        confidence: 0.81
      },
      alternativePossibilities: [],
      visualEvidence: [],
      confidenceLevel: "high",
      careGuidance: { culturalPractices: [], monitoring: [] },
      recommendExpertConsult: false,
      expertConsultReason: null,
      disclaimer: "",
      modelInfo: { provider: "roboflow", ranAt: createdAt },
      ...extra
    } as Scan["diagnosisResult"]
  };
}

test("only pest-classified scans appear", () => {
  const scans = [
    scan("a", "pest", daysAgo(1)),
    scan("b", "disease", daysAgo(2)),
    scan("c", "healthy", daysAgo(3)),
    scan("d", "inconclusive", daysAgo(4))
  ];
  const out = selectPestActivity(scans, CROPS, { now: NOW });
  assert.equal(out.length, 1);
  assert.equal(out[0].scanId, "a");
});

test("a category this build does not know is not treated as a pest", () => {
  // Defensive: the agent could add a category before the frontend knows
  // about it. Guessing "probably a pest" would put a sighting on a
  // farmer's page that nobody claimed.
  const scans = [scan("a", "infestation", daysAgo(1)), scan("b", "PEST", daysAgo(1))];
  assert.deepEqual(selectPestActivity(scans, CROPS, { now: NOW }), []);
});

test("results are newest first", () => {
  const scans = [
    scan("old", "pest", daysAgo(30)),
    scan("newest", "pest", daysAgo(1)),
    scan("middle", "pest", daysAgo(10))
  ];
  const out = selectPestActivity(scans, CROPS, { now: NOW });
  assert.deepEqual(out.map((r) => r.scanId), ["newest", "middle", "old"]);
});

test("the window is inclusive at its edge and excludes anything older", () => {
  const scans = [
    scan("inside", "pest", daysAgo(DEFAULT_WINDOW_DAYS - 1)),
    scan("edge", "pest", daysAgo(DEFAULT_WINDOW_DAYS)),
    scan("outside", "pest", daysAgo(DEFAULT_WINDOW_DAYS + 1))
  ];
  const ids = selectPestActivity(scans, CROPS, { now: NOW }).map((r) => r.scanId);
  assert.ok(ids.includes("inside"));
  assert.ok(ids.includes("edge"), "a scan exactly at the window edge was dropped");
  assert.ok(!ids.includes("outside"), "a scan older than the window was included");
});

test("the window is configurable", () => {
  const scans = [scan("a", "pest", daysAgo(20))];
  assert.equal(selectPestActivity(scans, CROPS, { now: NOW, windowDays: 30 }).length, 1);
  assert.equal(selectPestActivity(scans, CROPS, { now: NOW, windowDays: 7 }).length, 0);
});

test("a scan dated in the future is not a sighting", () => {
  const future = new Date(NOW.getTime() + 60 * 60 * 1000).toISOString();
  assert.deepEqual(selectPestActivity([scan("a", "pest", future)], CROPS, { now: NOW }), []);
});

test("the model's own numbers pass through unchanged", () => {
  const s = scan("a", "pest", daysAgo(1), {
    primaryFinding: {
      label: "Tomato Spider mites Two-spotted spider mite",
      category: "pest",
      confidence: 0.6234
    },
    confidenceLevel: "medium"
  });
  const [record] = selectPestActivity([s], CROPS, { now: NOW });
  assert.equal(record.confidence, 0.6234, "confidence was re-scaled or rounded");
  assert.equal(record.confidenceLevel, "medium", "the level was re-bucketed");
});

test("an out-of-range confidence is clamped, never rendered as 420%", () => {
  const high = scan("a", "pest", daysAgo(1), {
    primaryFinding: { label: "Spider mites", category: "pest", confidence: 4.2 }
  });
  const low = scan("b", "pest", daysAgo(1), {
    primaryFinding: { label: "Spider mites", category: "pest", confidence: -1 }
  });
  const out = selectPestActivity([high, low], CROPS, { now: NOW });
  assert.equal(out.find((r) => r.scanId === "a")?.confidence, 1);
  assert.equal(out.find((r) => r.scanId === "b")?.confidence, 0);
});

test("an unreadable confidence level degrades to the weakest claim", () => {
  const s = scan("a", "pest", daysAgo(1), { confidenceLevel: "certain" });
  assert.equal(selectPestActivity([s], CROPS, { now: NOW })[0].confidenceLevel, "low");
});

test("the expert-consult message is carried through when the agent gave one", () => {
  const s = scan("a", "pest", daysAgo(1), {
    recommendExpertConsult: true,
    expertConsultReason: "Model confidence is moderate."
  });
  const [record] = selectPestActivity([s], CROPS, { now: NOW });
  assert.equal(record.recommendExpertConsult, true);
  assert.equal(record.expertConsultReason, "Model confidence is moderate.");
});

test("a blank expert-consult reason becomes null, not an empty line", () => {
  const s = scan("a", "pest", daysAgo(1), {
    recommendExpertConsult: true,
    expertConsultReason: "   "
  });
  assert.equal(selectPestActivity([s], CROPS, { now: NOW })[0].expertConsultReason, null);
});

test("the crop name is resolved, and an unmatched crop is null not undefined", () => {
  const known = scan("a", "pest", daysAgo(1), {}, "crop-2");
  const gone = scan("b", "pest", daysAgo(2), {}, "crop-deleted");
  const out = selectPestActivity([known, gone], CROPS, { now: NOW });
  assert.equal(out.find((r) => r.scanId === "a")?.cropName, "Onion");
  assert.equal(out.find((r) => r.scanId === "b")?.cropName, null);
  assert.ok(!out.some((r) => r.cropName === undefined));
});

test("missing crops do not break the list", () => {
  const out = selectPestActivity([scan("a", "pest", daysAgo(1))], undefined, { now: NOW });
  assert.equal(out.length, 1);
  assert.equal(out[0].cropName, null);
});

test("malformed rows are skipped, never rendered blank", () => {
  const rows = [
    { ...scan("ok", "pest", daysAgo(1)) },
    { ...scan("noResult", "pest", daysAgo(1)), diagnosisResult: null },
    { ...scan("noFinding", "pest", daysAgo(1), { primaryFinding: null }) },
    { ...scan("emptyLabel", "pest", daysAgo(1), {
      primaryFinding: { label: "   ", category: "pest", confidence: 0.9 }
    }) },
    { ...scan("badDate", "pest", "not-a-date") }
  ] as Scan[];
  const out = selectPestActivity(rows, CROPS, { now: NOW });
  assert.deepEqual(out.map((r) => r.scanId), ["ok"]);
  for (const r of out) {
    assert.ok(!JSON.stringify(r).includes("undefined"));
    assert.ok(!JSON.stringify(r).includes("null,\"scannedAt\""));
  }
});

test("no scans, no farm, no crash", () => {
  assert.deepEqual(selectPestActivity([], CROPS, { now: NOW }), []);
  assert.deepEqual(selectPestActivity(undefined, CROPS, { now: NOW }), []);
  assert.deepEqual(selectPestActivity(undefined, undefined), []);
});

test("nothing is derived beyond what the scan recorded", () => {
  // The record shape is the contract: no risk score, no severity, no
  // forecast, no recommendation. If a field is ever added here, it has
  // to come from a scan — this asserts the shape has not grown one that
  // could not.
  const [record] = selectPestActivity([scan("a", "pest", daysAgo(1))], CROPS, { now: NOW });
  assert.deepEqual(Object.keys(record).sort(), [
    "confidence",
    "confidenceLevel",
    "cropName",
    "expertConsultReason",
    "label",
    "recommendExpertConsult",
    "scanId",
    "scannedAt"
  ]);
});
