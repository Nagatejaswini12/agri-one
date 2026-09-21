// Evaluates each in-scope scheme's criteria against what the farmer has
// actually recorded, and sorts it into one of three groups.
//
// THIS DELIBERATELY CANNOT PRODUCE AN "ELIGIBLE" VERDICT. Every catalog
// entry carries at least one criterion of kind "manual" — something only
// the farmer or the issuing office can confirm (land records, income-tax
// status, an enrolment window). Those always evaluate to "cannot_check"
// and are always returned, so the strongest statement the UI can make is
// "this matches what you have told us", never "you qualify". Getting that
// wrong in either direction is costly: a false yes sends a farmer on a
// wasted trip, a false no costs them a benefit they were entitled to.
//
// Groups:
//   other       at least one criterion is contradicted by recorded data
//   matched     nothing contradicted, and at least one criterion passed
//   needs_check nothing contradicted, but nothing could be checked either

const STALENESS_DAYS = 180;

const data = $input.first().json;
const areaAcres = data.areaAcres;
const crops = Array.isArray(data.crops) ? data.crops : [];
const cropsLower = crops.map((c) => String(c).toLowerCase());

const evaluateCriterion = (criterion, scheme) => {
  const kind = criterion.kind;

  if (kind === "farm_record") {
    return { status: "matched", params: null };
  }

  if (kind === "land_area_recorded") {
    return {
      status: areaAcres === null ? "cannot_check" : "matched",
      params: areaAcres === null ? null : { acres: areaAcres }
    };
  }

  if (kind === "max_area_acres") {
    const limit = criterion.params ? criterion.params.acres : null;
    if (areaAcres === null || limit == null) {
      return { status: "cannot_check", params: { acres: limit } };
    }
    return {
      status: areaAcres <= limit ? "matched" : "not_matched",
      params: { acres: limit }
    };
  }

  if (kind === "state_match") {
    if (!data.stateResolved) return { status: "cannot_check", params: null };
    return {
      status: scheme.states.indexOf(data.stateResolved) !== -1 ? "matched" : "not_matched",
      params: { state: data.stateResolved }
    };
  }

  if (kind === "crop_recorded") {
    return { status: crops.length > 0 ? "matched" : "not_matched", params: null };
  }

  if (kind === "crop_in") {
    const wanted = criterion.params && Array.isArray(criterion.params.crops)
      ? criterion.params.crops
      : [];
    // No recorded crop is not the same as a wrong crop: the first is
    // unknown, the second is a genuine mismatch.
    if (crops.length === 0) return { status: "cannot_check", params: { crops: wanted } };
    const hit = wanted.some((w) => cropsLower.indexOf(String(w).toLowerCase()) !== -1);
    return { status: hit ? "matched" : "not_matched", params: { crops: wanted } };
  }

  // "manual" and anything unrecognised. An unknown kind must never count
  // as a pass, so it degrades to the same "farmer must confirm" state.
  return { status: "cannot_check", params: null };
};

const daysSince = (iso) => {
  if (typeof iso !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const then = Date.parse(iso + "T00:00:00Z");
  if (Number.isNaN(then)) return null;
  return Math.floor((Date.now() - then) / 86400000);
};

// A malformed entry is dropped rather than half-rendered — a scheme card
// with no name or no source link is worse than one fewer scheme.
const isUsable = (s) =>
  s &&
  typeof s === "object" &&
  typeof s.id === "string" && s.id.trim() !== "" &&
  typeof s.name === "string" && s.name.trim() !== "" &&
  (s.level === "central" || s.level === "state") &&
  Array.isArray(s.states) &&
  typeof s.sourceUrl === "string" && /^https:\/\//.test(s.sourceUrl) &&
  typeof s.sourceName === "string" && s.sourceName.trim() !== "" &&
  Array.isArray(s.criteria) && s.criteria.length > 0;

const matches = [];
let oldestVerified = null;

for (const scheme of data.schemes) {
  if (!isUsable(scheme)) continue;

  const criteria = [];
  for (const c of scheme.criteria) {
    if (!c || typeof c.key !== "string" || typeof c.kind !== "string") continue;
    const result = evaluateCriterion(c, scheme);
    criteria.push({ key: c.key, status: result.status, params: result.params });
  }
  if (criteria.length === 0) continue;

  const notMatched = criteria.filter((c) => c.status === "not_matched").length;
  const matchedCount = criteria.filter((c) => c.status === "matched").length;
  const cannotCheck = criteria.filter((c) => c.status === "cannot_check").length;

  // Invariant the contract depends on: if a scheme is shown at all, the
  // farmer is shown something they still have to verify themselves.
  if (cannotCheck === 0) continue;

  const group = notMatched > 0 ? "other" : matchedCount > 0 ? "matched" : "needs_check";

  const age = daysSince(scheme.lastVerifiedOn);
  if (age !== null && (oldestVerified === null || scheme.lastVerifiedOn < oldestVerified)) {
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

return [
  {
    json: {
      askedState: data.askedState,
      askedDistrict: data.askedDistrict,
      stateResolved: data.stateResolved,
      stateSchemesSkipped: data.stateSchemesSkipped,
      locale: data.locale,
      catalogVersion: data.catalogVersion,
      totalSchemes: data.totalSchemes,
      catalogVerifiedOn: oldestVerified,
      matches
    }
  }
];
