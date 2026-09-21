// Wraps the evaluated matches in the DataResult contract
// (packages/shared-types). asOf is when this request ran;
// catalogVerifiedOn is when a human last checked the oldest entry in the
// catalog. They are separate on purpose — "checked just now" and
// "verified six months ago" are different facts, and collapsing them
// would overstate how current the scheme information is.

const SOURCE = "agri-one-curated-scheme-catalog";

const data = $input.first().json;
const matches = Array.isArray(data.matches) ? data.matches : [];

// An in-scope catalog that evaluates to nothing renderable is reported as
// unavailable rather than as an empty list, so the farmer is never left
// looking at a blank page wondering whether it loaded.
if (matches.length === 0) {
  return [
    {
      json: {
        status: "unavailable",
        reason: "No government schemes could be listed for this farm right now."
      }
    }
  ];
}

return [
  {
    json: {
      status: "ok",
      asOf: new Date().toISOString(),
      source: SOURCE,
      data: {
        state: data.stateResolved,
        district: data.askedDistrict,
        askedState: data.askedState,
        stateSchemesSkipped: data.stateSchemesSkipped,
        totalSchemes: data.totalSchemes,
        catalogVersion: data.catalogVersion,
        catalogVerifiedOn: data.catalogVerifiedOn,
        matches
      }
    }
  }
];
