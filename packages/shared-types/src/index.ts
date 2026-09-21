// Domain types shared across apps/web and the n8n workflows (via their
// JSON payload contracts). Mirrors the DB structure in
// docs/architecture.md — keep in sync with the Supabase schema.

export type SupportedLanguage = "en" | "ta" | "te" | "hi";

export interface Farmer {
  /** Same id as the Supabase auth user — no separate profile id. */
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  preferredLanguage: SupportedLanguage;
  createdAt: string;
  updatedAt: string;
}

export interface Farm {
  id: string;
  farmerId: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  state: string | null;
  district: string | null;
  areaAcres: number | null;
  createdAt: string;
  updatedAt: string;
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
  soilType: string | null;
  nitrogen: number | null;
  phosphorus: number | null;
  potassium: number | null;
  ph: number | null;
  organicCarbon: number | null;
  testedOn: string | null;
  documentUrl: string | null;
  createdAt: string;
}

export type DiagnosisCategory = "disease" | "pest" | "healthy" | "inconclusive";
export type DiagnosisConfidenceLevel = "high" | "medium" | "low";

export interface DiagnosisFinding {
  label: string;
  category: DiagnosisCategory;
  /**
   * The vision model's own reported probability (0-1) for this label —
   * a model score, not a calibrated real-world certainty. Always render
   * this as "the model's estimated likelihood," never as accuracy.
   */
  confidence: number;
}

export interface DiagnosisEvidenceImage {
  /** A real reference image the classifier matched against, not a generated illustration. */
  referenceImageUrl: string;
  matchScore: number;
}

/**
 * The Crop Diagnosis Agent's structured result. Deliberately has no
 * pesticide/chemical field anywhere in this shape — see
 * docs/architecture.md "Content rules". When evidence is insufficient,
 * primaryFinding.category is "inconclusive" and recommendExpertConsult
 * is true, rather than a forced diagnosis.
 */
export interface CropDiagnosisResult {
  cropName: string | null;
  primaryFinding: DiagnosisFinding;
  alternativePossibilities: DiagnosisFinding[];
  visualEvidence: DiagnosisEvidenceImage[];
  confidenceLevel: DiagnosisConfidenceLevel;
  careGuidance: {
    /** Non-chemical cultural/prevention practices only. */
    culturalPractices: string[];
    monitoring: string[];
  };
  recommendExpertConsult: boolean;
  expertConsultReason: string | null;
  disclaimer: string;
  modelInfo: {
    provider: string;
    ranAt: string;
  };
}

export interface Scan {
  id: string;
  farmId: string;
  cropId: string;
  imageUrl: string;
  diagnosisResult: CropDiagnosisResult | null;
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
 * Threshold-derived statements about what the forecast says — never
 * recommendations. The Weather Agent emits stable keys rather than prose
 * so the frontend renders them in the farmer's own language, and so no
 * treatment or chemical guidance can leak in from the agent side.
 */
export type WeatherAdvisoryFlag =
  | "rain_expected_today"
  | "heavy_rain_expected"
  | "thunderstorm_expected"
  | "high_wind"
  | "extreme_heat"
  | "no_rain_next_3_days";

/**
 * A value the source didn't report is `null` — never a substituted
 * default, per the no-fabricated-data rule in docs/architecture.md.
 * `weatherCode` is the raw WMO code; the frontend maps it to a
 * translated label (`weather.wmo.<code>`) so conditions aren't
 * English-only.
 */
export interface WeatherCurrent {
  /** Local time at the farm, as the source reported it. */
  observedAt: string | null;
  temperatureC: number | null;
  relativeHumidityPct: number | null;
  precipitationMm: number | null;
  windSpeedKph: number | null;
  weatherCode: number | null;
}

export interface WeatherForecastDay {
  /** YYYY-MM-DD in the farm's local timezone. */
  date: string;
  weatherCode: number | null;
  temperatureMaxC: number | null;
  temperatureMinC: number | null;
  precipitationSumMm: number | null;
  precipitationProbabilityMaxPct: number | null;
}

/**
 * The Weather Agent's payload, keyed to a farm's own coordinates — the
 * frontend sends `farms.latitude/longitude`, so no location is ever
 * assumed or hardcoded. Nothing here is persisted: weather is read live
 * on each view.
 */
export interface WeatherSnapshot {
  latitude: number | null;
  longitude: number | null;
  /** IANA zone the readings are expressed in, e.g. "Asia/Kolkata". */
  timezone: string | null;
  current: WeatherCurrent;
  /** Up to three days, starting today. */
  forecast: WeatherForecastDay[];
  advisories: WeatherAdvisoryFlag[];
}

/**
 * One mandi's reported prices for a commodity. Every price is exactly
 * what the source reported; a field the source omitted is `null`, never
 * 0 — a zero-rupee price would read as "free", which is worse than "not
 * reported". The UI renders a `null` as a dash.
 */
export interface MarketPriceQuote {
  /** Mandi (market yard) name, in the source's own spelling. */
  market: string;
  variety: string | null;
  grade: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  /** The most commonly transacted price — what a farmer actually gets. */
  modalPrice: number | null;
  /** YYYY-MM-DD, converted from the source's DD/MM/YYYY arrival date. */
  reportedOn: string | null;
}

/** AGMARKNET quotes rupees per quintal; no other unit is in use yet. */
export type MarketPriceUnit = "INR_PER_QUINTAL";

/**
 * The Market Agent's payload — a current/latest snapshot only. The
 * underlying AGMARKNET resource is a daily snapshot with no history
 * behind it, which is why there are no trend charts (see
 * docs/architecture.md "Content rules").
 *
 * `state`/`district` are AGMARKNET's own spellings, resolved from what
 * the farmer saved on the farm; they can differ from the farmer's
 * spelling, so the UI shows the resolved names rather than the typed
 * ones.
 */
export interface MarketSnapshot {
  commodity: string;
  state: string;
  district: string;
  /** Newest date across `quotes`; null when none carried a readable one. */
  latestReportedOn: string | null;
  priceUnit: MarketPriceUnit;
  /** Every mandi the source reported — never truncated to a "best" price. */
  quotes: MarketPriceQuote[];
}

/** A central scheme applies nationwide; a state scheme only in `states`. */
export type SchemeLevel = "central" | "state";

/**
 * One eligibility condition, evaluated against what the farmer actually
 * recorded.
 *
 * `cannot_check` is the important one: it means the condition is real but
 * only the farmer or the issuing office can confirm it (land records,
 * income-tax status, an enrolment window). Every scheme in the catalog
 * carries at least one, which is what makes a bare "you are eligible"
 * result impossible to construct — see docs/architecture.md "Phase 5".
 */
export interface SchemeCriterion {
  /** Maps to a `schemes.criteria.<key>` label, so criteria translate. */
  key: string;
  status: "matched" | "not_matched" | "cannot_check";
  /** Interpolation values for the label, e.g. `{ state, acres }`. */
  params: Record<string, string | number> | null;
}

/**
 * A curated catalog entry. Scheme content is maintained by hand from
 * official sources — there is no public API for Indian scheme
 * eligibility — so `sourceUrl` and `lastVerifiedOn` travel with every
 * entry and must be shown to the farmer.
 */
export interface GovernmentScheme {
  id: string;
  name: string;
  level: SchemeLevel;
  /** Empty for a central scheme. */
  states: string[];
  purpose: string | null;
  benefit: string | null;
  /** Empty means the scheme is not crop-specific. */
  appliesToCrops: string[];
  sourceName: string;
  sourceUrl: string;
  /** YYYY-MM-DD a person last checked this entry against its source. */
  lastVerifiedOn: string | null;
}

/**
 * `matched` — nothing recorded contradicts it and at least one condition
 * passed. `needs_check` — nothing contradicts it, but nothing could be
 * checked either. `other` — something recorded does contradict it.
 *
 * None of these mean "eligible": `criteria` always carries at least one
 * `cannot_check` the farmer still has to confirm.
 */
export interface SchemeMatch {
  scheme: GovernmentScheme;
  group: "matched" | "needs_check" | "other";
  criteria: SchemeCriterion[];
  /** Its source hasn't been re-checked inside the staleness window. */
  stale: boolean;
}

export interface SchemeMatchResult {
  /** Resolved to the official spelling, or null if it couldn't be. */
  state: string | null;
  district: string | null;
  /** What the farm record actually said, before resolution. */
  askedState: string | null;
  /**
   * State schemes that couldn't be considered because the farm has no
   * usable state. Shown to the farmer rather than silently dropped.
   */
  stateSchemesSkipped: number;
  totalSchemes: number;
  catalogVersion: string | null;
  /** Oldest `lastVerifiedOn` across the returned entries. */
  catalogVerifiedOn: string | null;
  matches: SchemeMatch[];
}

/**
 * Every live-data module response must be one of these two shapes —
 * never a silently-defaulted value when a source is unavailable.
 */
export type DataResult<T> =
  | { status: "ok"; asOf: string; source: string; data: T }
  | { status: "unavailable"; reason: string };
