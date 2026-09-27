import type {
  DataResult,
  SchemeCriterion,
  SchemeMatch,
  SchemeMatchResult
} from "@agri-one/shared-types";
import type { CatalogCriterion, CatalogScheme } from "./catalog.js";

/**
 * The scheme matching pipeline, moved out of n8n unchanged.
 *
 * A direct port of Load Catalog → Filter By State → Evaluate Criteria →
 * Build Match Result, thresholds and wording included, so a farmer is
 * told the same thing from a different caller. The n8n workflow is left
 * in place and untouched as a rollback copy.
 *
 * THIS DELIBERATELY CANNOT PRODUCE AN "ELIGIBLE" VERDICT. Every catalog
 * entry carries at least one criterion of kind "manual", which always
 * evaluates to "cannot_check", and a scheme with zero cannot_check
 * criteria is dropped rather than shown. So the strongest statement the
 * UI can make is "this matches what you have told us", never "you
 * qualify". Getting that wrong in either direction is costly: a false
 * yes sends a farmer on a wasted trip, a false no costs them a benefit
 * they were entitled to.
 *
 * Pure: no I/O and no clock except where passed in, which is what makes
 * the staleness boundary and every group assignment testable.
 */

const SOURCE = "agri-one-curated-scheme-catalog";
const STALENESS_DAYS = 180;

/** Every state and union territory a scheme may name. */
const STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka",
  "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya",
  "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim",
  "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand",
  "West Bengal", "Andaman and Nicobar Islands", "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Jammu and Kashmir",
  "Ladakh", "Lakshadweep", "Puducherry"
];

/** Names that are not spelling variants but different names entirely. */
const STATE_ALIASES: Record<string, string> = {
  orissa: "Odisha",
  keralam: "Kerala",
  pondicherry: "Puducherry",
  uttaranchal: "Uttarakhand",
  newdelhi: "Delhi",
  nctofdelhi: "Delhi",
  jammukashmir: "Jammu and Kashmir"
};

const plain = (v: unknown): string =>
  String(v == null ? "" : v).toLowerCase().replace(/[^a-z]/g, "");

/**
 * Exact-or-nothing, the same discipline as the Market Agent's district
 * matching. "tamilnadu" / "Tamil Nadu" / "TAMIL NADU" all resolve;
 * anything that matches zero states — or more than one — resolves to
 * nothing, because guessing between two real states is exactly what
 * must not happen here.
 */
export function resolveState(asked: unknown): string | null {
  const key = plain(asked);
  if (!key) return null;
  if (STATE_ALIASES[key]) return STATE_ALIASES[key];
  const hits = STATES.filter((s) => plain(s) === key);
  return hits.length === 1 ? hits[0] : null;
}

const text = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : null;

/**
 * Anything non-numeric stays null so the area criterion says "cannot
 * check" rather than silently reading as 0 acres.
 */
const num = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
};

/**
 * Crops may arrive as a real array, a JSON string, or a comma-separated
 * list. Nothing is invented if none of those parse: the farmer simply
 * has no crops recorded.
 */
export function parseCrops(v: unknown): string[] {
  let raw: unknown = v;
  if (typeof raw === "string") {
    const s = raw.trim();
    if (s === "") return [];
    if (s.charAt(0) === "[") {
      try {
        raw = JSON.parse(s);
      } catch {
        raw = s.split(",");
      }
    } else {
      raw = s.split(",");
    }
  }
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    const name =
      typeof item === "string"
        ? item
        : item && typeof item === "object"
          ? ((item as Record<string, unknown>).cropName ??
             (item as Record<string, unknown>).crop_name ??
             (item as Record<string, unknown>).name)
          : null;
    const cleaned = text(name);
    if (cleaned) out.push(cleaned);
  }
  return out;
}

interface EvalContext {
  areaAcres: number | null;
  crops: string[];
  cropsLower: string[];
  stateResolved: string | null;
}

function evaluateCriterion(
  criterion: CatalogCriterion,
  scheme: CatalogScheme,
  ctx: EvalContext
): { status: SchemeCriterion["status"]; params: SchemeCriterion["params"] } {
  const kind = criterion.kind;

  if (kind === "farm_record") {
    return { status: "matched", params: null };
  }

  if (kind === "land_area_recorded") {
    return {
      status: ctx.areaAcres === null ? "cannot_check" : "matched",
      params: ctx.areaAcres === null ? null : { acres: ctx.areaAcres }
    };
  }

  if (kind === "max_area_acres") {
    const limit = criterion.params ? (criterion.params.acres as number | undefined) : null;
    if (ctx.areaAcres === null || limit == null) {
      return { status: "cannot_check", params: { acres: limit as number } };
    }
    return {
      status: ctx.areaAcres <= limit ? "matched" : "not_matched",
      params: { acres: limit }
    };
  }

  if (kind === "state_match") {
    if (!ctx.stateResolved) return { status: "cannot_check", params: null };
    return {
      status: scheme.states.indexOf(ctx.stateResolved) !== -1 ? "matched" : "not_matched",
      params: { state: ctx.stateResolved }
    };
  }

  if (kind === "crop_recorded") {
    return { status: ctx.crops.length > 0 ? "matched" : "not_matched", params: null };
  }

  if (kind === "crop_in") {
    const wanted =
      criterion.params && Array.isArray(criterion.params.crops)
        ? (criterion.params.crops as string[])
        : [];
    // No recorded crop is not the same as a wrong crop: the first is
    // unknown, the second is a genuine mismatch.
    //
    // One deliberate deviation from the n8n node: it put the wanted
    // crops in `params` as an array, but SchemeCriterion.params only
    // permits string|number, and normalize.ts's asParams drops arrays —
    // so that label never reached a farmer. Joining keeps it type-valid
    // and renders. No catalog entry uses crop_in today, so this changes
    // nothing currently on screen.
    if (ctx.crops.length === 0) {
      return { status: "cannot_check", params: { crops: wanted.join(", ") } };
    }
    const hit = wanted.some((w) => ctx.cropsLower.indexOf(String(w).toLowerCase()) !== -1);
    return { status: hit ? "matched" : "not_matched", params: { crops: wanted.join(", ") } };
  }

  // "manual" and anything unrecognised. An unknown kind must never count
  // as a pass, so it degrades to the same "farmer must confirm" state.
  return { status: "cannot_check", params: null };
}

function daysSince(iso: unknown, now: Date): number | null {
  if (typeof iso !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const then = Date.parse(iso + "T00:00:00Z");
  if (Number.isNaN(then)) return null;
  return Math.floor((now.getTime() - then) / 86400000);
}

/**
 * A malformed entry is dropped rather than half-rendered — a scheme card
 * with no name or no source link is worse than one fewer scheme.
 */
function isUsable(s: CatalogScheme): boolean {
  return (
    !!s &&
    typeof s === "object" &&
    typeof s.id === "string" && s.id.trim() !== "" &&
    typeof s.name === "string" && s.name.trim() !== "" &&
    (s.level === "central" || s.level === "state") &&
    Array.isArray(s.states) &&
    typeof s.sourceUrl === "string" && /^https:\/\//.test(s.sourceUrl) &&
    typeof s.sourceName === "string" && s.sourceName.trim() !== "" &&
    Array.isArray(s.criteria) && s.criteria.length > 0
  );
}

export interface SchemesRequest {
  state?: unknown;
  district?: unknown;
  areaAcres?: unknown;
  crops?: unknown;
  locale?: unknown;
}

/**
 * The whole pipeline, from the request the page sends to the
 * DataResult the page renders.
 */
export function matchSchemes(
  request: SchemesRequest,
  now: () => Date,
  /**
   * Passed in rather than imported. A type-only import erases at compile
   * time, which keeps this module free of a cross-file runtime import —
   * Node's test runner wants a ".ts" extension on one and Vercel's
   * typecheck rejects it, and a value import would have forced the
   * catalog to be inlined here. Keeping it a separate file is the point
   * of the migration: a curated catalog should be reviewable in a diff.
   *
   * It also means the caller declares which catalog it serves.
   */
  catalog: CatalogScheme[],
  catalogVersion: string
): DataResult<SchemeMatchResult> {
  // ---- Load Catalog: normalise the caller's inputs. Nothing here reads
  // the request to decide what a scheme says — the catalog is a fixed
  // constant, so a crafted request can never introduce scheme content.
  const askedState = text(request.state);
  const askedDistrict = text(request.district);
  const areaAcres = num(request.areaAcres);
  const crops = parseCrops(request.crops);

  // ---- Filter By State
  const stateResolved = resolveState(askedState);
  const inScope: CatalogScheme[] = [];
  for (const scheme of catalog) {
    if (scheme.level === "central") {
      inScope.push(scheme);
      continue;
    }
    // A state scheme needs a resolved state to be in scope at all.
    // Without one it is left out and counted below, so the farmer is told
    // how many schemes could not be considered rather than being shown a
    // shorter list with no explanation.
    if (stateResolved && scheme.states.indexOf(stateResolved) !== -1) {
      inScope.push(scheme);
    }
  }
  const stateSchemesSkipped = stateResolved
    ? 0
    : catalog.filter((s) => s.level === "state").length;

  // ---- Evaluate Criteria
  const ctx: EvalContext = {
    areaAcres,
    crops,
    cropsLower: crops.map((c) => String(c).toLowerCase()),
    stateResolved
  };
  const at = now();
  const matches: SchemeMatch[] = [];
  let oldestVerified: string | null = null;

  for (const scheme of inScope) {
    if (!isUsable(scheme)) continue;

    const criteria: SchemeCriterion[] = [];
    for (const c of scheme.criteria) {
      if (!c || typeof c.key !== "string" || typeof c.kind !== "string") continue;
      const result = evaluateCriterion(c, scheme, ctx);
      criteria.push({ key: c.key, status: result.status, params: result.params });
    }
    if (criteria.length === 0) continue;

    const notMatched = criteria.filter((c) => c.status === "not_matched").length;
    const matchedCount = criteria.filter((c) => c.status === "matched").length;
    const cannotCheck = criteria.filter((c) => c.status === "cannot_check").length;

    // The invariant the whole contract depends on: if a scheme is shown
    // at all, the farmer is shown something they still have to verify
    // themselves.
    if (cannotCheck === 0) continue;

    const group: SchemeMatch["group"] =
      notMatched > 0 ? "other" : matchedCount > 0 ? "matched" : "needs_check";

    const age = daysSince(scheme.lastVerifiedOn, at);
    if (
      age !== null &&
      (oldestVerified === null || (scheme.lastVerifiedOn as string) < oldestVerified)
    ) {
      oldestVerified = scheme.lastVerifiedOn;
    }

    matches.push({
      scheme: {
        id: scheme.id,
        name: scheme.name,
        level: scheme.level,
        states: scheme.states,
        purpose: scheme.purpose || null,
        benefit: scheme.benefit || null,
        appliesToCrops: Array.isArray(scheme.appliesToCrops) ? scheme.appliesToCrops : [],
        sourceName: scheme.sourceName,
        sourceUrl: scheme.sourceUrl,
        lastVerifiedOn: typeof scheme.lastVerifiedOn === "string" ? scheme.lastVerifiedOn : null
      },
      group,
      criteria,
      stale: age === null ? true : age > STALENESS_DAYS
    });
  }

  // ---- Build Match Result
  // An in-scope catalog that evaluates to nothing renderable is reported
  // as unavailable rather than as an empty list, so the farmer is never
  // left looking at a blank page wondering whether it loaded.
  if (matches.length === 0) {
    return {
      status: "unavailable",
      reason: "No government schemes could be listed for this farm right now."
    };
  }

  return {
    status: "ok",
    // asOf is when this request ran; catalogVerifiedOn is when a human
    // last checked the oldest entry. They are separate on purpose —
    // "checked just now" and "verified six months ago" are different
    // facts, and collapsing them would overstate how current the scheme
    // information is.
    asOf: at.toISOString(),
    source: SOURCE,
    data: {
      state: stateResolved,
      district: askedDistrict,
      askedState,
      stateSchemesSkipped,
      totalSchemes: catalog.length,
      catalogVersion,
      catalogVerifiedOn: oldestVerified,
      matches
    }
  };
}
