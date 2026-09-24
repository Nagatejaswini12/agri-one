// Maps the Roboflow crop-disease object-detection response
// (crop-disease-axhjj/1) into the CropDiagnosisResult contract.
//
// Current model:
//   crop-disease-axhjj/1
//   Roboflow 3.0 Object Detection
//   9 classes, focused on tomato leaves.
//
// Important:
// - Roboflow returns object detections with class + confidence.
// - Multiple detections of the SAME class are normal.
// - We only treat predictions as ambiguous when DIFFERENT classes
//   have very similar confidence.
// - No treatment/prevention text is invented.
// - HTTP failures are handled as unavailable.
// - Low-confidence or unclear results remain inconclusive.

const INCONCLUSIVE_THRESHOLD = 0.4;
const AMBIGUOUS_MARGIN = 0.15;
const HIGH_THRESHOLD = 0.75;

// ------------------------------------------------------------
// Label -> category
// ------------------------------------------------------------
//
// Returns one of the four DiagnosisCategory values declared in
// packages/shared-types: "healthy" | "pest" | "disease" |
// "inconclusive". Nothing else may ever be returned from here.
//
// ORDER IS LOAD-BEARING. The model's mite class is
// "Tomato Spider mites Two-spotted spider mite", which contains
// "spotted" — so the disease pattern's /spot/ would claim it if disease
// were tested first. A two-spotted spider mite is an arthropod feeding
// on the plant, not a pathogen infecting it, and filing it as a disease
// was wrong: it made "pest" unreachable even though the contract has
// always declared it.
//
// This function names only WHAT WAS SEEN. It implies no treatment, and
// no chemical, product or dose appears anywhere in this workflow.

const HEALTHY_PATTERN = /healthy/i;

// Arthropod pests. Only the spider-mite class exists in
// crop-disease-axhjj/1 today; the rest are listed so that swapping in a
// broader model cannot silently refile an insect as a pathogen again.
const PEST_PATTERN =
  /spider\s*mites?|\bmites?\b|\baphids?\b|\bwhitefl(?:y|ies)\b|\bthrips\b|\bborers?\b|\bleaf\s*miners?\b|\bcaterpillars?\b|\b(?:army|horn|boll)worms?\b|\bmealybugs?\b/i;

// Pathogen-caused conditions.
const DISEASE_PATTERN =
  /blight|bacterial|mosaic|virus|mold|mould|septoria|spot|rust|rot|disease|wilt|canker|scab|powdery|downy/i;

function categoriseLabel(label) {
  if (typeof label !== "string" || label.trim().length === 0) return "inconclusive";

  // Class names arrive both as "Spider mites Two-spotted spider mite" and
  // as "Tomato___Spider_mites_Two-spotted_spider_mite", depending on how
  // the model version was exported. An underscore is a word character,
  // so \bmites\b silently fails against the second spelling and the
  // label falls through to "spotted" -> disease. Normalise separators
  // first so both spellings classify identically.
  const text = label.trim().replace(/[_-]+/g, " ").replace(/\s+/g, " ");

  if (HEALTHY_PATTERN.test(text)) return "healthy";
  if (PEST_PATTERN.test(text)) return "pest";
  if (DISEASE_PATTERN.test(text)) return "disease";
  return "inconclusive";
}

const MODEL_ID = "crop-disease-axhjj/1";
const SOURCE = "roboflow-crop-disease-axhjj-v1";

const input = $input.first()?.json ?? {};

// ------------------------------------------------------------
// HTTP response handling
// ------------------------------------------------------------

const statusCode = Number(
  input.statusCode ??
  input.status ??
  200
);

let body = input.body ?? input;

// Parse body if n8n returns it as a string
if (typeof body === "string") {
  try {
    body = JSON.parse(body);
  } catch {
    body = {};
  }
}

// ------------------------------------------------------------
// HTTP/API failure
// ------------------------------------------------------------

if (statusCode >= 400) {
  console.log("Roboflow HTTP failure, status:", statusCode);
  return [
    {
      json: {
        status: "unavailable",
        asOf: new Date().toISOString(),
        source: SOURCE,
        data: {
          cropName: $('Core Trigger').first().json.cropName ?? null,

          primaryFinding: {
            label: "Unavailable",
            category: "inconclusive",
            confidence: 0
          },

          alternativePossibilities: [],

          visualEvidence: [],

          confidenceLevel: "low",

          careGuidance: {
            culturalPractices: [],
            monitoring: []
          },

          recommendExpertConsult: true,

          expertConsultReason: "The diagnosis service is currently unavailable. Please try again.",

          disclaimer:
            "The automated crop-disease service was unavailable. No diagnosis was generated.",

          modelInfo: {
            provider: "roboflow",
            modelId: MODEL_ID,
            ranAt: new Date().toISOString()
          }
        }
      }
    }
  ];
}

// ------------------------------------------------------------
// Prediction extraction
// ------------------------------------------------------------

const rawPredictions = Array.isArray(body?.predictions)
  ? body.predictions
  : [];

const predictions = rawPredictions
  .filter(
    (p) =>
      p &&
      typeof p.class === "string" &&
      p.class.trim().length > 0 &&
      typeof p.confidence === "number" &&
      Number.isFinite(p.confidence)
  )
  .sort((a, b) => b.confidence - a.confidence);

const top = predictions[0] ?? null;

// ------------------------------------------------------------
// Ambiguity check
// ------------------------------------------------------------
//
// Object detection can return multiple boxes for the same class.
// Those are NOT automatically competing diagnoses.
//
// Find the strongest prediction belonging to a DIFFERENT class.

const secondDifferentClass = top
  ? predictions.find((p) => p.class !== top.class)
  : null;

const isAmbiguous =
  !!top &&
  !!secondDifferentClass &&
  Math.abs(
    top.confidence - secondDifferentClass.confidence
  ) < AMBIGUOUS_MARGIN;

// ------------------------------------------------------------
// Primary finding
// ------------------------------------------------------------

let primaryFinding;
let recommendExpertConsult = false;
let expertConsultReason = null;

if (!top) {
  primaryFinding = {
    label: "Inconclusive",
    category: "inconclusive",
    confidence: 0
  };

  recommendExpertConsult = true;

  expertConsultReason =
    "The model did not return a usable prediction for this image.";
}

else if (top.confidence < INCONCLUSIVE_THRESHOLD) {
  primaryFinding = {
    label: "Inconclusive",
    category: "inconclusive",
    confidence: top.confidence
  };

  recommendExpertConsult = true;

  expertConsultReason =
    "Model confidence is too low to report a reliable finding.";
}

else if (isAmbiguous) {
  primaryFinding = {
    label: "Inconclusive",
    category: "inconclusive",
    confidence: top.confidence
  };

  recommendExpertConsult = true;

  expertConsultReason =
    "Different possible classes have very similar confidence, so no single finding is reported.";
}

else {
  const label = top.class.trim();

  const category = categoriseLabel(label);

  if (category === "healthy") {
    primaryFinding = {
      label,
      category: "healthy",
      confidence: top.confidence
    };
  }

  // Pest and disease are reported the same way: the model saw something
  // on the plant, and a moderate score still warrants a human look.
  else if (category === "pest" || category === "disease") {
    primaryFinding = {
      label,
      category,
      confidence: top.confidence
    };

    if (top.confidence < HIGH_THRESHOLD) {
      recommendExpertConsult = true;

      expertConsultReason =
        "Model confidence is moderate. Verify the visual finding with a local agricultural expert before taking action.";
    }
  }

  else {
    // Example: "Tomato leaf"
    // This does not explicitly mean healthy or diseased.
    primaryFinding = {
      label: "Inconclusive",
      category: "inconclusive",
      confidence: top.confidence
    };

    recommendExpertConsult = true;

    expertConsultReason =
      `The model returned "${label}", but that label does not explicitly indicate a pest, a disease or a healthy condition.`;
  }
}

// ------------------------------------------------------------
// Confidence level
// ------------------------------------------------------------

const confidenceLevel =
  primaryFinding.confidence >= HIGH_THRESHOLD
    ? "high"
    : primaryFinding.confidence >= INCONCLUSIVE_THRESHOLD
      ? "medium"
      : "low";

// ------------------------------------------------------------
// Alternative possibilities
// ------------------------------------------------------------
//
// Only include different classes.
// Multiple detections of the same class are ignored as alternatives.

const alternativePossibilities =
  primaryFinding.category === "inconclusive"
    ? []
    : predictions
        .filter((p) => p.class !== top.class)
        .slice(0, 3)
        .map((p) => ({
          label: p.class,

          category: categoriseLabel(p.class),

          confidence: p.confidence
        }));

// ------------------------------------------------------------
// Final CropDiagnosisResult
// ------------------------------------------------------------

return [
  {
    json: {
      status: "ok",

      asOf: new Date().toISOString(),

      source: SOURCE,

      data: {
        cropName:
          $('Core Trigger').first().json.cropName ?? null,

        primaryFinding,

        alternativePossibilities,

        visualEvidence: [],

        confidenceLevel,

        careGuidance: {
          culturalPractices: [],
          monitoring: []
        },

        recommendExpertConsult,

        expertConsultReason,

        disclaimer:
          "AI-based crop disease estimation. Results are indicative only and should be confirmed with a qualified agricultural expert before taking action.",

        modelInfo: {
          provider: "roboflow",
          modelId: MODEL_ID,
          ranAt: new Date().toISOString()
        }
      }
    }
  }
];