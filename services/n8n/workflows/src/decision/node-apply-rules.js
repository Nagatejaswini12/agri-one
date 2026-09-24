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

/**
 * Groups quotes that are actually comparable: same variety AND same
 * grade. Self-contained on purpose — the regression test reads this
 * function straight out of the shipped node source and evaluates it, so
 * what is tested is exactly what n8n runs.
 *
 * WHY THIS EXISTS. AGMARKNET returns several varieties of one commodity
 * side by side, and their prices are not comparable. Madurai onion on
 * 2026-09-24 reported Bellary at Rs 4,500 and Onion Green at Rs 8,700;
 * Pune reported Local onion at Rs 2,850 and "Other" at Rs 10 in the very
 * same mandi. Ranking those together and calling the gap a spread tells
 * a farmer they could get 87x more by changing venue, when the real
 * difference is that it is a different product. A spread is only
 * meaningful between venues selling the same thing.
 *
 * An identical copy of this function lives in the chat answer builder.
 * scripts/verify-decision-rules.mjs asserts the two stay byte-identical.
 */
function groupComparableQuotes(quotes) {
  const list = Array.isArray(quotes) ? quotes : [];
  const groups = [];
  const index = {};
  for (const q of list) {
    if (!q || typeof q !== "object") continue;
    const price =
      typeof q.modalPrice === "number" && Number.isFinite(q.modalPrice) ? q.modalPrice : null;
    // A quote with no usable price cannot take part in a comparison, and
    // a quote with no mandi name cannot be named in one.
    if (price === null) continue;
    const market = typeof q.market === "string" ? q.market.trim() : "";
    if (market === "") continue;

    const variety =
      typeof q.variety === "string" && q.variety.trim() !== "" ? q.variety.trim() : null;
    const grade = typeof q.grade === "string" && q.grade.trim() !== "" ? q.grade.trim() : null;
    // \u0001 cannot occur in a source value, so it is a safe separator.
    const key = (variety === null ? "\u0000" : variety) + "\u0001" + (grade === null ? "\u0000" : grade);

    if (index[key] === undefined) {
      index[key] = groups.length;
      groups.push({ variety, grade, quotes: [] });
    }
    groups[index[key]].quotes.push({ market, price });
  }
  return groups;
}

// --- market (rules 7-8) ----------------------------------------------
const market = ok("market");
if (market) {
  const crop = text(market.commodity) || text(context.primaryCrop);
  // Only quotes that are comparable to each other, grouped by the
  // variety and grade the source reported.
  const groups = groupComparableQuotes(market.quotes);

  if (groups.length > 0 && crop) {
    // Report a price from the most widely reported variety: it is the
    // one most likely to be what the farmer actually grows, and naming
    // the variety means the number can be checked.
    let main = groups[0];
    for (const g of groups) if (g.quotes.length > main.quotes.length) main = g;

    let best = main.quotes[0];
    for (const q of main.quotes) if (q.price > best.price) best = q;

    emit(
      main.variety ? "marketPriceReportedVariety" : "marketPriceReported",
      {
        crop,
        variety: main.variety || "",
        price: best.price,
        market: best.market,
        district: text(market.district) || "",
        reportedOn: text(market.latestReportedOn) || ""
      },
      "low",
      "market"
    );

    // A spread is only a fact when both ends are the same product. Each
    // group is checked on its own, and the widest qualifying one is
    // reported; a group with fewer than two venues cannot have a spread
    // at all. This is still not advice to go anywhere: transport,
    // quantity and relationships are things this system knows nothing
    // about.
    let widest = null;
    let widestRatio = 0;
    for (const g of groups) {
      if (g.quotes.length < 2) continue;
      let low = g.quotes[0];
      let high = g.quotes[0];
      for (const q of g.quotes) {
        if (q.price < low.price) low = q;
        if (q.price > high.price) high = q;
      }
      if (low.price <= 0) continue;
      const ratio = (high.price - low.price) / low.price;
      if (ratio >= SPREAD_THRESHOLD && ratio > widestRatio) {
        widestRatio = ratio;
        widest = { group: g, low, high };
      }
    }

    if (widest) {
      emit(
        widest.group.variety ? "marketSpreadVariety" : "marketSpread",
        {
          crop,
          variety: widest.group.variety || "",
          low: widest.low.price,
          high: widest.high.price,
          lowMarket: widest.low.market,
          highMarket: widest.high.market
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
