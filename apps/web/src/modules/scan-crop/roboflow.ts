import type {
  CropDiagnosisResult,
  DataResult,
  DiagnosisCategory,
  DiagnosisFinding
} from "@agri-one/shared-types";

/**
 * Roboflow's crop-disease response, mapped into the CropDiagnosisResult
 * contract.
 *
 * A direct port of the n8n "Map Diagnosis Result" node — thresholds,
 * patterns and wording included — so moving the call off n8n changes
 * where the request is made and nothing about what a farmer is told.
 * The n8n workflow is left in place and untouched as a rollback copy.
 *
 * The patterns and thresholds below were copied out of that node
 * programmatically rather than retyped. Retyping a regex is exactly how
 * the underscore bug got in the first time: "\bmites\b" silently fails
 * against "Tomato___Spider_mites_Two-spotted_spider_mite", and the label
 * then fell through to "spotted" and was filed as a disease.
 *
 * No chemical, product or dose appears anywhere in this file, and
 * careGuidance is never populated — the agent names only what was seen.
 *
 * Pure: no I/O and no clock except what is passed in.
 */

export const INCONCLUSIVE_THRESHOLD = 0.4;
export const AMBIGUOUS_MARGIN = 0.15;
export const HIGH_THRESHOLD = 0.75;

export const MODEL_ID = "crop-disease-axhjj/1";
export const SOURCE = "roboflow-crop-disease-axhjj-v1";
export const ROBOFLOW_URL = "https://serverless.roboflow.com/crop-disease-axhjj/1";

const HEALTHY_PATTERN = /healthy/i;

// Arthropod pests. Only the spider-mite class exists in
// crop-disease-axhjj/1 today; the rest are listed so that swapping in a
// broader model cannot silently refile an insect as a pathogen again.
const PEST_PATTERN =
  /spider\s*mites?|\bmites?\b|\baphids?\b|\bwhitefl(?:y|ies)\b|\bthrips\b|\bborers?\b|\bleaf\s*miners?\b|\bcaterpillars?\b|\b(?:army|horn|boll)worms?\b|\bmealybugs?\b/i;

// Pathogen-caused conditions.
const DISEASE_PATTERN =
  /blight|bacterial|mosaic|virus|mold|mould|septoria|spot|rust|rot|disease|wilt|canker|scab|powdery|downy/i;

/**
 * Returns one of the four DiagnosisCategory values. Nothing else may
 * ever be returned from here.
 *
 * ORDER IS LOAD-BEARING. The model's mite class is "Tomato Spider mites
 * Two-spotted spider mite", which contains "spotted" — so the disease
 * pattern's /spot/ would claim it if disease were tested first. A
 * two-spotted spider mite is an arthropod feeding on the plant, not a
 * pathogen infecting it, and filing it as a disease made "pest"
 * unreachable even though the contract has always declared it.
 *
 * This function names only WHAT WAS SEEN. It implies no treatment.
 */
export function categoriseLabel(label: unknown): DiagnosisCategory {
  if (typeof label !== "string" || label.trim().length === 0) return "inconclusive";

  // Class names arrive both as "Spider mites Two-spotted spider mite"
  // and as "Tomato___Spider_mites_Two-spotted_spider_mite", depending on
  // how the model version was exported. An underscore is a word
  // character, so \bmites\b silently fails against the second spelling
  // and the label falls through to "spotted" -> disease. Normalise
  // separators first so both spellings classify identically.
  const text = label.trim().replace(/[_-]+/g, " ").replace(/\s+/g, " ");

  if (HEALTHY_PATTERN.test(text)) return "healthy";
  if (PEST_PATTERN.test(text)) return "pest";
  if (DISEASE_PATTERN.test(text)) return "disease";
  return "inconclusive";
}

interface RoboflowPrediction {
  class: string;
  confidence: number;
}

function usablePredictions(body: unknown): RoboflowPrediction[] {
  const raw =
    typeof body === "object" && body !== null && Array.isArray((body as { predictions?: unknown }).predictions)
      ? ((body as { predictions: unknown[] }).predictions)
      : [];
  return raw
    .filter(
      (p): p is RoboflowPrediction =>
        !!p &&
        typeof p === "object" &&
        typeof (p as RoboflowPrediction).class === "string" &&
        (p as RoboflowPrediction).class.trim().length > 0 &&
        typeof (p as RoboflowPrediction).confidence === "number" &&
        Number.isFinite((p as RoboflowPrediction).confidence)
    )
    .sort((a, b) => b.confidence - a.confidence);
}

/**
 * The agent's own failure shape.
 *
 * One deliberate simplification from the n8n node: it emitted
 * `status: "unavailable"` together with a full `data` envelope, and
 * normalize.ts then dug the message back out of
 * `data.expertConsultReason`. The farmer sees the same sentence either
 * way, so this emits the plain `{ status, reason }` every other agent
 * uses and normalize.ts passes it straight through.
 */
export function diagnosisUnavailable(reason: string): DataResult<CropDiagnosisResult> {
  return { status: "unavailable", reason };
}

/**
 * Maps a Roboflow response into CropDiagnosisResult.
 *
 * `cropName` is echoed from the request — it is the farmer's own record,
 * never something the model inferred.
 */
export function mapRoboflow(
  body: unknown,
  cropName: string | null,
  now: () => Date = () => new Date()
): DataResult<CropDiagnosisResult> {
  const predictions = usablePredictions(body);
  const top = predictions[0] ?? null;

  // Object detection returns multiple boxes for the same class; those
  // are not competing diagnoses. Only a strong prediction of a DIFFERENT
  // class makes a result ambiguous.
  const secondDifferentClass = top ? predictions.find((p) => p.class !== top.class) : undefined;
  const isAmbiguous =
    !!top &&
    !!secondDifferentClass &&
    Math.abs(top.confidence - secondDifferentClass.confidence) < AMBIGUOUS_MARGIN;

  let primaryFinding: DiagnosisFinding;
  let recommendExpertConsult = false;
  let expertConsultReason: string | null = null;

  if (!top) {
    primaryFinding = { label: "Inconclusive", category: "inconclusive", confidence: 0 };
    recommendExpertConsult = true;
    expertConsultReason = "The model did not return a usable prediction for this image.";
  } else if (top.confidence < INCONCLUSIVE_THRESHOLD) {
    primaryFinding = { label: "Inconclusive", category: "inconclusive", confidence: top.confidence };
    recommendExpertConsult = true;
    expertConsultReason = "Model confidence is too low to report a reliable finding.";
  } else if (isAmbiguous) {
    primaryFinding = { label: "Inconclusive", category: "inconclusive", confidence: top.confidence };
    recommendExpertConsult = true;
    expertConsultReason =
      "Different possible classes have very similar confidence, so no single finding is reported.";
  } else {
    const label = top.class.trim();
    const category = categoriseLabel(label);

    if (category === "healthy") {
      primaryFinding = { label, category: "healthy", confidence: top.confidence };
    } else if (category === "pest" || category === "disease") {
      // Pest and disease are reported the same way: the model saw
      // something on the plant, and a moderate score still warrants a
      // human look.
      primaryFinding = { label, category, confidence: top.confidence };
      if (top.confidence < HIGH_THRESHOLD) {
        recommendExpertConsult = true;
        expertConsultReason =
          "Model confidence is moderate. Verify the visual finding with a local agricultural expert before taking action.";
      }
    } else {
      // Example: "Tomato leaf" — does not explicitly mean healthy or
      // diseased, so no finding is claimed.
      primaryFinding = { label: "Inconclusive", category: "inconclusive", confidence: top.confidence };
      recommendExpertConsult = true;
      expertConsultReason = `The model returned "${label}", but that label does not explicitly indicate a pest, a disease or a healthy condition.`;
    }
  }

  const confidenceLevel =
    primaryFinding.confidence >= HIGH_THRESHOLD
      ? "high"
      : primaryFinding.confidence >= INCONCLUSIVE_THRESHOLD
        ? "medium"
        : "low";

  // Only different classes count as alternatives; repeated detections of
  // the same class are not competing possibilities.
  const alternativePossibilities: DiagnosisFinding[] =
    primaryFinding.category === "inconclusive" || !top
      ? []
      : predictions
          .filter((p) => p.class !== top.class)
          .slice(0, 3)
          .map((p) => ({
            label: p.class,
            category: categoriseLabel(p.class),
            confidence: p.confidence
          }));

  const ranAt = now().toISOString();

  return {
    status: "ok",
    asOf: ranAt,
    source: SOURCE,
    data: {
      cropName,
      primaryFinding,
      alternativePossibilities,
      // Never populated: the model returns no reference images, and a
      // generated illustration would not be evidence.
      visualEvidence: [],
      confidenceLevel,
      // Never populated. No chemical, product or dose is produced
      // anywhere in this agent.
      careGuidance: { culturalPractices: [], monitoring: [] },
      recommendExpertConsult,
      expertConsultReason,
      disclaimer:
        "AI-based crop disease estimation. Results are indicative only and should be confirmed with a qualified agricultural expert before taking action.",
      modelInfo: { provider: "roboflow", ranAt }
    }
  };
}
