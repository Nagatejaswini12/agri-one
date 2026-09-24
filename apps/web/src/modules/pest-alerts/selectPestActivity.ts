import type { DiagnosisConfidenceLevel, FarmCrop, Scan } from "@agri-one/shared-types";

/**
 * Turns the farmer's own scan history into the pest-activity list.
 *
 * Everything here is a record of something that already happened: a
 * photo the farmer took, on a date, that the Crop Diagnosis model
 * classified as a pest. Nothing is predicted, inferred from weather, or
 * derived from any signal other than that scan.
 *
 * The confidence figures pass through untouched. Re-bucketing or
 * rounding them would turn the model's own reported score into a new
 * claim made by this module, and the whole point is that this module
 * makes no claims of its own.
 */

export interface PestActivityRecord {
  scanId: string;
  /** The crop the farmer selected when scanning, if it still exists. */
  cropName: string | null;
  /** ISO timestamp of the scan. */
  scannedAt: string;
  /** The model's class name, exactly as recorded. */
  label: string;
  /** The model's own reported probability, 0-1. Never re-scaled. */
  confidence: number;
  confidenceLevel: DiagnosisConfidenceLevel;
  recommendExpertConsult: boolean;
  /** The agent's own reason, when it gave one. */
  expertConsultReason: string | null;
}

export interface SelectPestActivityOptions {
  /** Defaults to now. Injectable so the window is testable. */
  now?: Date;
  /** How far back the page looks. Shown to the farmer, never silent. */
  windowDays?: number;
}

export const DEFAULT_WINDOW_DAYS = 90;

const CONFIDENCE_LEVELS: readonly DiagnosisConfidenceLevel[] = ["high", "medium", "low"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * `diagnosis_result` is jsonb, written by an agent that lives outside
 * this repo's type checking. A row that predates a contract change, or
 * one that was written partially, must be skipped rather than rendered
 * as a blank pest sighting.
 */
export function selectPestActivity(
  scans: Scan[] | undefined,
  crops: FarmCrop[] | undefined,
  options: SelectPestActivityOptions = {}
): PestActivityRecord[] {
  if (!Array.isArray(scans) || scans.length === 0) return [];

  const windowDays = options.windowDays ?? DEFAULT_WINDOW_DAYS;
  const now = options.now ?? new Date();
  const cutoff = now.getTime() - windowDays * 24 * 60 * 60 * 1000;

  const records: PestActivityRecord[] = [];

  for (const scan of scans) {
    if (!isRecord(scan)) continue;

    const result = scan.diagnosisResult;
    if (!isRecord(result)) continue;

    const finding = result.primaryFinding;
    if (!isRecord(finding)) continue;

    // The one thing that puts a scan on this page. Anything else —
    // disease, healthy, inconclusive, or a category this build does not
    // know — belongs to Scan History, not here.
    if (finding.category !== "pest") continue;

    const label = typeof finding.label === "string" ? finding.label.trim() : "";
    if (label === "") continue;

    const scannedAt = typeof scan.createdAt === "string" ? scan.createdAt : "";
    const when = Date.parse(scannedAt);
    if (!Number.isFinite(when)) continue;

    // Inclusive at exactly the window edge; a scan from the future is a
    // clock problem, not a sighting, so it is kept out.
    if (when < cutoff || when > now.getTime()) continue;

    const confidence =
      typeof finding.confidence === "number" && Number.isFinite(finding.confidence)
        ? Math.min(Math.max(finding.confidence, 0), 1)
        : 0;

    const level = CONFIDENCE_LEVELS.includes(result.confidenceLevel as DiagnosisConfidenceLevel)
      ? (result.confidenceLevel as DiagnosisConfidenceLevel)
      : // An unreadable level is treated as the weakest claim, never the
        // strongest.
        "low";

    const crop = crops?.find((c) => c.id === scan.cropId);

    records.push({
      scanId: scan.id,
      cropName: typeof crop?.cropName === "string" ? crop.cropName : null,
      scannedAt,
      label,
      confidence,
      confidenceLevel: level,
      recommendExpertConsult: result.recommendExpertConsult === true,
      expertConsultReason:
        typeof result.expertConsultReason === "string" && result.expertConsultReason.trim() !== ""
          ? result.expertConsultReason.trim()
          : null
    });
  }

  // Newest first — the most recent sighting is the one a farmer is
  // looking for.
  records.sort((a, b) => Date.parse(b.scannedAt) - Date.parse(a.scannedAt));
  return records;
}
