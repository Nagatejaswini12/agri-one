import type {
  CropDiagnosisResult,
  DataResult,
  DiagnosisCategory,
  DiagnosisConfidenceLevel,
  DiagnosisEvidenceImage,
  DiagnosisFinding
} from "@agri-one/shared-types";

/**
 * The Crop Diagnosis Agent runs in n8n, outside this codebase's type
 * checking — a workflow edit can change its payload without the frontend
 * knowing. This normalizes whatever actually arrives into the
 * CropDiagnosisResult contract so a missing or renamed field degrades to
 * an honest "unavailable"/empty state instead of crashing the page.
 *
 * Nothing here invents content: absent arrays become empty arrays, an
 * unusable primary finding becomes "unavailable", and careGuidance is
 * never populated from anything other than what the agent actually sent.
 */

const CATEGORIES: readonly DiagnosisCategory[] = ["disease", "pest", "healthy", "inconclusive"];
const CONFIDENCE_LEVELS: readonly DiagnosisConfidenceLevel[] = ["high", "medium", "low"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/** Model scores are probabilities; clamp so a bad value can't render as "420%". */
function asConfidence(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 1);
}

function asFinding(value: unknown): DiagnosisFinding | null {
  if (!isRecord(value)) return null;
  const label = asString(value.label);
  if (!label) return null;
  const category = CATEGORIES.includes(value.category as DiagnosisCategory)
    ? (value.category as DiagnosisCategory)
    : "inconclusive";
  return { label, category, confidence: asConfidence(value.confidence) };
}

function asFindingList(value: unknown): DiagnosisFinding[] {
  if (!Array.isArray(value)) return [];
  return value.map(asFinding).filter((f): f is DiagnosisFinding => f !== null);
}

function asEvidenceList(value: unknown): DiagnosisEvidenceImage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const referenceImageUrl = asString(item.referenceImageUrl);
    if (!referenceImageUrl) return [];
    return [{ referenceImageUrl, matchScore: asConfidence(item.matchScore) }];
  });
}

/** Only non-empty strings survive — blank bullet points help nobody. */
function asTextList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const text = asString(item);
    return text ? [text] : [];
  });
}

function deriveConfidenceLevel(value: unknown, confidence: number): DiagnosisConfidenceLevel {
  if (CONFIDENCE_LEVELS.includes(value as DiagnosisConfidenceLevel)) {
    return value as DiagnosisConfidenceLevel;
  }
  if (confidence >= 0.75) return "high";
  if (confidence >= 0.4) return "medium";
  return "low";
}

export function normalizeDiagnosisResult(
  result: DataResult<unknown>
): DataResult<CropDiagnosisResult> {
  if (result.status === "unavailable") {
    // The agent reports its own failures as an "unavailable" envelope that
    // carries the detail on data.expertConsultReason rather than a top-level
    // `reason`, so recover it instead of rendering a blank message.
    if (asString(result.reason)) return result;
    const envelope = result as unknown as { data?: unknown };
    const detail = isRecord(envelope.data) ? asString(envelope.data.expertConsultReason) : null;
    return {
      status: "unavailable",
      reason: detail ?? "The diagnosis service is currently unavailable."
    };
  }

  const data = result.data;
  if (!isRecord(data)) {
    return { status: "unavailable", reason: "The diagnosis service returned an unreadable response." };
  }

  const primaryFinding = asFinding(data.primaryFinding);
  if (!primaryFinding) {
    return { status: "unavailable", reason: "The diagnosis service returned no usable finding." };
  }

  const careGuidance = isRecord(data.careGuidance) ? data.careGuidance : {};
  const modelInfo = isRecord(data.modelInfo) ? data.modelInfo : {};

  return {
    status: "ok",
    asOf: asString(result.asOf) ?? new Date().toISOString(),
    source: asString(result.source) ?? "unknown",
    data: {
      cropName: asString(data.cropName),
      primaryFinding,
      // A finding can't be an "alternative" to itself.
      alternativePossibilities: asFindingList(data.alternativePossibilities).filter(
        (alt) => alt.label !== primaryFinding.label
      ),
      visualEvidence: asEvidenceList(data.visualEvidence),
      confidenceLevel: deriveConfidenceLevel(data.confidenceLevel, primaryFinding.confidence),
      careGuidance: {
        culturalPractices: asTextList(careGuidance.culturalPractices),
        monitoring: asTextList(careGuidance.monitoring)
      },
      recommendExpertConsult:
        typeof data.recommendExpertConsult === "boolean"
          ? data.recommendExpertConsult
          : // Unknown means we can't rule out that a consult is warranted.
            primaryFinding.category !== "healthy",
      expertConsultReason: asString(data.expertConsultReason),
      // Empty string signals the UI to fall back to its own translated
      // disclaimer — every result must carry one (see docs/architecture.md).
      disclaimer: asString(data.disclaimer) ?? "",
      modelInfo: {
        provider: asString(modelInfo.provider) ?? "unknown",
        ranAt: asString(modelInfo.ranAt) ?? new Date().toISOString()
      }
    }
  };
}
