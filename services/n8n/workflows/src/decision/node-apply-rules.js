// ---------------------------------------------------------------------
// THE DECISION RULE TABLE.
//
// Every line of the farm briefing comes from exactly one rule below.
// Rules are explicit, ordered and auditable; nothing here is generated,
// inferred by a model, or phrased at runtime. A rule may only emit
// { key, params, priority, sourceAgent } — the wording lives in the
// locale bundles, written once per language and reviewable by a person.
//
// HARD EXCLUSIONS, enforced by the shape of the data this node receives
// as much as by these rules:
//
//  1. No chemical name, product, dosage, or treatment instruction. Ever.
//     There is no rule that could produce one, and RULE_AUDIT below is
//     asserted in the unit tests.
//  2. No agronomic guidance derived from soil chemistry. The frontend
//     sends only `latestSoil.testedOn` — NPK and pH never leave the
//     browser, so "advise from soil values" is impossible rather than
//     merely forbidden.
//  3. No guidance derived from a diagnosis label. The frontend sends
//     only category / confidenceLevel / recommendExpertConsult, never
//     the disease name, so rule 9 can restate the agent's own
//     recommendation and nothing more.
//  4. No cross-agent causal rules. Stating that rain is forecast AND
//     that prices were reported invites a "sell before the rain"
//     reading that neither signal supports. Deliberately excluded.
//  5. Nothing historical. No trends, no comparisons to last week.
//
// Ordering is priority tier, then the declared index below, so the same
// inputs always produce the same order.
// ---------------------------------------------------------------------

const SPREAD_THRESHOLD = 0.15; // mandi spread worth naming: 15% of the lowest modal
const SCAN_WINDOW_DAYS = 30;
const SOIL_STALE_DAYS = 365;

const WEATHER_FLAG_RULES = [
  { flag: "heavy_rain_expected", key: "heavyRainExpected", priority: "high" },
  { flag: "thunderstorm_expected", key: "thunderstormExpected", priority: "high" },
  { flag: "extreme_heat", key: "extremeHeat", priority: "high" },
  { flag: "high_wind", key: "highWind", priority: "medium" },
  { flag: "no_rain_next_3_days", key: "noRainNext3Days", priority: "medium" },
  { flag: "rain_expected_today", key: "rainExpectedToday", priority: "low" }
];

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

const data = $input.first().json;
const context = data.context || {};
const signals = data.signals || {};

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const text = (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

const daysSince = (iso) => {
  const s = text(iso);
  if (!s) return null;
  const then = Date.parse(s.length === 10 ? s + "T00:00:00Z" : s);
  if (Number.isNaN(then)) return null;
  return Math.floor((Date.now() - then) / 86400000);
};

/** A signal counts as usable only when the agent itself said "ok". */
const ok = (name) => {
  const s = signals[name];
  return s && s.status === "ok" && s.data && typeof s.data === "object" ? s.data : null;
};

const actions = [];
let index = 0;
const emit = (key, params, priority, sourceAgent) => {
  actions.push({ key, params: params || null, priority, sourceAgent, _i: index++ });
};

// --- weather (rules 1-6) ---------------------------------------------
// The agent already emits descriptive threshold flags. These are
// restated and prioritised; nothing is added to them.
const weather = ok("weather");
if (weather) {
  const flags = Array.isArray(weather.advisories) ? weather.advisories : [];
  for (const rule of WEATHER_FLAG_RULES) {
    if (flags.indexOf(rule.flag) !== -1) emit(rule.key, null, rule.priority, "weather");
  }
}

// --- market (rules 7-8) ----------------------------------------------
const market = ok("market");
if (market) {
  const quotes = Array.isArray(market.quotes) ? market.quotes : [];
  const priced = quotes.filter((q) => q && num(q.modalPrice) !== null);
  const crop = text(market.commodity) || text(context.primaryCrop);

  if (priced.length > 0 && crop) {
    let low = priced[0];
    let high = priced[0];
    for (const q of priced) {
      if (num(q.modalPrice) < num(low.modalPrice)) low = q;
      if (num(q.modalPrice) > num(high.modalPrice)) high = q;
    }

    emit(
      "marketPriceReported",
      {
        crop,
        price: num(high.modalPrice),
        market: text(high.market) || "",
        district: text(market.district) || "",
        reportedOn: text(market.latestReportedOn) || ""
      },
      "low",
      "market"
    );

    // Naming the spread is a fact about today's reported prices. It is
    // not advice to go to a particular mandi: transport, quantity and
    // relationships are things this system knows nothing about.
    const lowP = num(low.modalPrice);
    const highP = num(high.modalPrice);
    if (lowP !== null && highP !== null && lowP > 0 && (highP - lowP) / lowP >= SPREAD_THRESHOLD) {
      emit(
        "marketSpread",
        {
          crop,
          low: lowP,
          high: highP,
          lowMarket: text(low.market) || "",
          highMarket: text(high.market) || ""
        },
        "medium",
        "market"
      );
    }
  }
}

// --- diagnosis (rules 9-10) ------------------------------------------
// Restates what the Crop Diagnosis Agent itself flagged. The disease
// label never reaches this workflow, so no treatment can be implied.
const scans = Array.isArray(context.recentScans) ? context.recentScans : [];
const recent = scans.filter((s) => {
  const age = daysSince(s && s.createdAt);
  return age !== null && age <= SCAN_WINDOW_DAYS;
});

const needsExpert = recent.filter((s) => s.recommendExpertConsult === true);
if (needsExpert.length > 0) {
  const newest = needsExpert[0];
  emit(
    "recentDiagnosisNeedsExpert",
    { crop: text(newest.cropName) || "", count: needsExpert.length },
    "high",
    "diagnosis"
  );
}

const inconclusive = recent.filter(
  (s) => s.category === "inconclusive" && s.recommendExpertConsult !== true
);
if (inconclusive.length > 0) {
  emit("recentDiagnosisInconclusive", { count: inconclusive.length }, "low", "diagnosis");
}

// --- schemes (rules 11-12) -------------------------------------------
// "matched" means nothing recorded contradicts the scheme. It is never
// eligibility, and the label the farmer reads says so.
const schemes = ok("schemes");
if (schemes) {
  const matches = Array.isArray(schemes.matches) ? schemes.matches : [];
  const matched = matches.filter((m) => m && m.group === "matched");
  if (matched.length > 0) emit("schemesMatched", { count: matched.length }, "medium", "schemes");

  const skipped = num(schemes.stateSchemesSkipped);
  if (skipped !== null && skipped > 0) {
    emit("schemesStateUnknown", { count: skipped }, "low", "schemes");
  }
}

// --- soil (rules 13-14) ----------------------------------------------
// Only the presence and age of a record. No NPK, no pH, no guidance:
// reading soil chemistry into advice is a job for an agronomist.
const soil = context.latestSoil;
if (!soil || !text(soil.testedOn)) {
  emit("soilDataMissing", null, "low", "soil");
} else {
  const age = daysSince(soil.testedOn);
  if (age !== null && age > SOIL_STALE_DAYS) {
    emit("soilDataStale", { testedOn: text(soil.testedOn), years: Math.floor(age / 365) }, "low", "soil");
  }
}

// --- farm record completeness (rules 15-17) --------------------------
// Each of these is the reason a signal above could not run, stated where
// the farmer can act on it.
if (num(context.latitude) === null || num(context.longitude) === null) {
  emit("farmLocationMissing", null, "low", "farm");
}
if (!text(context.state) || !text(context.district)) {
  emit("farmDistrictMissing", null, "low", "farm");
}
const crops = Array.isArray(context.crops) ? context.crops.filter((c) => text(c)) : [];
if (crops.length === 0) {
  emit("noCropsRecorded", null, "low", "farm");
}

actions.sort((a, b) => {
  const p = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
  return p !== 0 ? p : a._i - b._i;
});

return [
  {
    json: {
      context,
      signals,
      locale: data.locale,
      actions: actions.map((a) => ({
        key: a.key,
        params: a.params,
        priority: a.priority,
        sourceAgent: a.sourceAgent
      }))
    }
  }
];
