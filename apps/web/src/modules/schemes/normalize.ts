import type {
  DataResult,
  GovernmentScheme,
  SchemeCriterion,
  SchemeMatch,
  SchemeMatchResult
} from "@agri-one/shared-types";

/**
 * The Schemes Agent runs in n8n, outside this codebase's type checking,
 * so a workflow edit can change its payload without the frontend
 * knowing. This coerces whatever actually arrives into
 * `SchemeMatchResult` — an unusable entry is dropped and an unusable
 * payload becomes "unavailable", rather than rendering a half-blank
 * scheme card.
 *
 * Two invariants are enforced here as well as in the agent, because
 * either side could regress independently:
 *
 *  - a scheme with no name or no official `https://` source link is
 *    dropped, since the whole value of a card is that the farmer can go
 *    read the real thing;
 *  - a scheme whose criteria contain no `cannot_check` is dropped, so
 *    the UI can never present something that reads as a guaranteed
 *    entitlement.
 */

const CRITERION_STATUSES = ["matched", "not_matched", "cannot_check"] as const;
const GROUPS = ["matched", "needs_check", "other"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Only YYYY-MM-DD counts; anything else is "no verified date". */
function asIsoDate(value: unknown): string | null {
  const s = asString(value);
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [, mm, dd] = s.split("-").map(Number) as [number, number, number];
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  return s;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((v) => {
    const s = asString(v);
    return s ? [s] : [];
  });
}

/** Only scalars survive — a nested object would have no sane label. */
function asParams(value: unknown): Record<string, string | number> | null {
  if (!isRecord(value)) return null;
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else {
      const s = asString(v);
      if (s) out[k] = s;
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

function asCriteria(value: unknown): SchemeCriterion[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const key = asString(item.key);
    const status = item.status;
    if (!key) return [];
    // An unrecognised status must never read as a pass.
    if (!CRITERION_STATUSES.includes(status as (typeof CRITERION_STATUSES)[number])) {
      return [{ key, status: "cannot_check" as const, params: asParams(item.params) }];
    }
    return [
      {
        key,
        status: status as SchemeCriterion["status"],
        params: asParams(item.params)
      }
    ];
  });
}

function asScheme(value: unknown): GovernmentScheme | null {
  if (!isRecord(value)) return null;
  const id = asString(value.id);
  const name = asString(value.name);
  const sourceUrl = asString(value.sourceUrl);
  const sourceName = asString(value.sourceName);
  const level = value.level === "central" || value.level === "state" ? value.level : null;

  // An http:// or relative link is not an official source we'd send a
  // farmer to, so it fails the same way a missing one does.
  if (!id || !name || !level || !sourceName || !sourceUrl || !/^https:\/\//.test(sourceUrl)) {
    return null;
  }

  return {
    id,
    name,
    level,
    states: asStringArray(value.states),
    purpose: asString(value.purpose),
    benefit: asString(value.benefit),
    appliesToCrops: asStringArray(value.appliesToCrops),
    sourceName,
    sourceUrl,
    lastVerifiedOn: asIsoDate(value.lastVerifiedOn)
  };
}

function asMatches(value: unknown): SchemeMatch[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const scheme = asScheme(item.scheme);
    if (!scheme) return [];

    const criteria = asCriteria(item.criteria);
    if (criteria.length === 0) return [];

    // The contract's core promise: the farmer always sees something they
    // must still verify themselves.
    if (!criteria.some((c) => c.status === "cannot_check")) return [];

    const group = GROUPS.includes(item.group as (typeof GROUPS)[number])
      ? (item.group as SchemeMatch["group"])
      : "needs_check";

    return [
      {
        scheme,
        group,
        criteria,
        // Unknown staleness is treated as stale: claiming an entry is
        // fresh is the error that matters here.
        stale: typeof item.stale === "boolean" ? item.stale : true
      }
    ];
  });
}

export function normalizeSchemesResult(
  result: DataResult<unknown>
): DataResult<SchemeMatchResult> {
  if (result.status === "unavailable") {
    if (asString(result.reason)) return result;
    return { status: "unavailable", reason: "The government scheme list is currently unavailable." };
  }

  const data = result.data;
  if (!isRecord(data)) {
    return { status: "unavailable", reason: "The government scheme list returned an unreadable response." };
  }

  const matches = asMatches(data.matches);

  // Nothing renderable is reported as unavailable rather than as an empty
  // page the farmer can't interpret.
  if (matches.length === 0) {
    return { status: "unavailable", reason: "No government schemes could be listed for this farm." };
  }

  return {
    status: "ok",
    asOf: asString(result.asOf) ?? new Date().toISOString(),
    source: asString(result.source) ?? "unknown",
    data: {
      state: asString(data.state),
      district: asString(data.district),
      askedState: asString(data.askedState),
      stateSchemesSkipped: asNumber(data.stateSchemesSkipped) ?? 0,
      totalSchemes: asNumber(data.totalSchemes) ?? matches.length,
      catalogVersion: asString(data.catalogVersion),
      catalogVerifiedOn: asIsoDate(data.catalogVerifiedOn),
      matches
    }
  };
}
