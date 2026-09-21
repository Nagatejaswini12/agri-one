// Decides which schemes are even in scope for this farm.
//
// Central schemes apply everywhere. A state scheme applies only to its own
// states, and only once the farm's free-text state has been resolved to a
// canonical name. A farm with no saved state is NOT treated as "no state
// schemes apply" — it is treated as "state schemes could not be
// considered", and the flag below makes the UI say exactly that.
//
// Resolution is exact-or-nothing, the same discipline as the Market
// Agent's district matching: lowercase, letters only, then compare. That
// handles "tamilnadu" / "Tamil Nadu" / "TAMIL NADU" without ever guessing
// between two different states.

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

// Names that are not spelling variants but different names entirely.
const STATE_ALIASES = {
  orissa: "Odisha",
  keralam: "Kerala",
  pondicherry: "Puducherry",
  uttaranchal: "Uttarakhand",
  newdelhi: "Delhi",
  nctofdelhi: "Delhi",
  jammukashmir: "Jammu and Kashmir"
};

const plain = (v) =>
  String(v == null ? "" : v).toLowerCase().replace(/[^a-z]/g, "");

const resolveState = (asked) => {
  const key = plain(asked);
  if (!key) return null;
  if (STATE_ALIASES[key]) return STATE_ALIASES[key];
  const hits = STATES.filter((s) => plain(s) === key);
  return hits.length === 1 ? hits[0] : null;
};

const data = $input.first().json;
const stateResolved = resolveState(data.askedState);

const inScope = [];
for (const scheme of data.catalog) {
  if (scheme.level === "central") {
    inScope.push(scheme);
    continue;
  }
  // A state scheme needs a resolved state to be in scope at all. Without
  // one it is left out of the results and counted below, so the farmer is
  // told how many schemes could not be considered rather than being shown
  // a shorter list with no explanation.
  if (stateResolved && scheme.states.indexOf(stateResolved) !== -1) {
    inScope.push(scheme);
  }
}

const stateSchemesSkipped = stateResolved
  ? 0
  : data.catalog.filter((s) => s.level === "state").length;

return [
  {
    json: {
      askedState: data.askedState,
      askedDistrict: data.askedDistrict,
      stateResolved,
      stateSchemesSkipped,
      areaAcres: data.areaAcres,
      crops: data.crops,
      locale: data.locale,
      catalogVersion: data.catalogVersion,
      totalSchemes: data.catalog.length,
      schemes: inScope
    }
  }
];
