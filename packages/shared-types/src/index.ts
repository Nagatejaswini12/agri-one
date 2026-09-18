// Domain types shared across apps/web and the n8n workflows (via their
// JSON payload contracts). Mirrors the DB structure in
// docs/architecture.md — keep in sync with the Supabase schema.

export type SupportedLanguage = "en" | "ta" | "te" | "hi";

export interface Farmer {
  id: string;
  name: string;
  contact: string;
  preferredLanguage: SupportedLanguage;
  authProviderId: string;
  createdAt: string;
}

export interface Farm {
  id: string;
  farmerId: string;
  name: string;
  latitude: number;
  longitude: number;
  state: string;
  district: string;
  areaAcres: number;
  createdAt: string;
}

export interface FarmCrop {
  id: string;
  farmId: string;
  cropName: string;
  variety: string | null;
  sowingDate: string | null;
  currentStage: string | null;
  status: "active" | "harvested" | "abandoned";
}

export type SoilRecordSource = "manual" | "shc_upload";

export interface SoilRecord {
  id: string;
  farmId: string;
  source: SoilRecordSource;
  nitrogen: number | null;
  phosphorus: number | null;
  potassium: number | null;
  ph: number | null;
  organicCarbon: number | null;
  testedOn: string | null;
  documentUrl: string | null;
}

export interface Scan {
  id: string;
  farmId: string;
  cropId: string;
  imageUrl: string;
  diagnosisResult: Record<string, unknown> | null;
  confidence: number | null;
  createdAt: string;
}

export interface Advisory {
  id: string;
  farmId: string;
  sourceAgent: string;
  summary: string;
  actionChecklist: ActionItem[];
  language: SupportedLanguage;
  /**
   * Required whenever the advisory includes chemical/agricultural
   * guidance (fertilizer, pesticide, dosage, etc.): a source/confirmation
   * note stating this is general guidance, not a substitute for a
   * qualified agronomist. The Decision Agent must populate this — see
   * docs/architecture.md "Content rules".
   */
  disclaimer: string | null;
  createdAt: string;
}

export interface ActionItem {
  label: string;
  priority: "high" | "medium" | "low";
  done: boolean;
}

/**
 * Farmer-entered cost/revenue entries backing the Reports module's
 * revenue/cost/margin views. Never derived, estimated, or pre-filled —
 * only what the farmer actually recorded.
 */
export interface FarmFinancialRecord {
  id: string;
  farmId: string;
  cropId: string | null;
  type: "cost" | "revenue";
  category: string; // e.g. "seed", "fertilizer", "labor", "sale"
  amount: number;
  quantity: number | null;
  unit: string | null;
  recordedOn: string;
  notes: string | null;
}

/**
 * Farmer-entered harvest quantities backing the Reports module's yield
 * views.
 */
export interface YieldRecord {
  id: string;
  farmId: string;
  cropId: string;
  quantity: number;
  unit: string;
  harvestedOn: string;
}

/**
 * Every live-data module response must be one of these two shapes —
 * never a silently-defaulted value when a source is unavailable.
 */
export type DataResult<T> =
  | { status: "ok"; asOf: string; source: string; data: T }
  | { status: "unavailable"; reason: string };
