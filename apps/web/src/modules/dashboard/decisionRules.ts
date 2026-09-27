import type {
  DataResult,
  DecisionAction,
  DecisionPriority,
  DecisionSourceAgent,
  FarmBriefing,
  SignalStatus
} from "@agri-one/shared-types";

/**
 * THE DECISION RULE TABLE.
 *
 * Every line of the farm briefing comes from exactly one rule below.
 * Rules are explicit, ordered and auditable; nothing here is generated,
 * inferred by a model, or phrased at runtime. A rule may only emit
 * { key, params, priority, sourceAgent } — the wording lives in the
 * locale bundles, written once per language and reviewable by a person.
 *
 * A direct port of the n8n Decision - Core nodes, thresholds and
 * ordering included. The n8n workflow is left in place and untouched as
 * a rollback copy.
 *
 * HARD EXCLUSIONS, enforced by the shape of the data this receives as
 * much as by these rules:
 *
 *  1. No chemical name, product, dosage, or treatment instruction. Ever.
 *  2. No agronomic guidance derived from soil chemistry. The frontend
 *     sends only `latestSoil.testedOn` — NPK and pH never leave the
 *     browser, so "advise from soil values" is impossible rather than
 *     merely forbidden.
 *  3. No guidance derived from a diagnosis label. The frontend sends
 *     only category / confidenceLevel / recommendExpertConsult, never
 *     the disease name, so the diagnosis rules can restate the agent's
 *     own recommendation and nothing more.
 *  4. No cross-agent causal rules. Stating that rain is forecast AND
 *     that prices were reported invites a "sell before the rain"
 *     reading that neither signal supports. Deliberately excluded.
 *  5. Nothing historical. No trends, no comparisons to last week.
 *
 * Ordering is priority tier, then the declared index, so the same
 * inputs always produce the same order.
 */

const SPREAD_THRESHOLD = 0.15; // mandi spread worth naming: 15% of the lowest modal
const SCAN_WINDOW_DAYS = 30;
const SOIL_STALE_DAYS = 365;

const WEATHER_FLAG_RULES: { flag: string; key: string; priority: DecisionPriority }[] = [
  { flag: "heavy_rain_expected", key: "heavyRainExpected", priority: "high" },
  { flag: "thunderstorm_expected", key: "thunderstormExpected", priority: "high" },
  { flag: "extreme_heat", key: "extremeHeat", priority: "high" },
  { flag: "high_wind", key: "highWind", priority: "medium" },
  { flag: "no_rain_next_3_days", key: "noRainNext3Days", priority: "medium" },
  { flag: "rain_expected_today", key: "rainExpectedToday", priority: "low" }
];

const PRIORITY_ORDER: Record<DecisionPriority, number> = { high: 0, medium: 1, low: 2 };

const SOURCE = "agri-one-orchestrator";
const AGENTS: DecisionSourceAgent[] = ["weather", "market", "schemes", "diagnosis", "soil", "farm"];

/** Every key the table can emit. Asserted against the locale bundles. */
export const RULE_KEYS = [
  ...WEATHER_FLAG_RULES.map((r) => r.key),
  "marketPriceReported",
  "marketPriceReportedVariety",
  "marketSpread",
  "marketSpreadVariety",
  "recentDiagnosisNeedsExpert",
  "recentDiagnosisInconclusive",
  "schemesMatched",
  "schemesStateUnknown",
  "soilDataMissing",
  "soilDataStale",
  "farmLocationMissing",
  "farmDistrictMissing",
  "noCropsRecorded"
] as const;

export interface BriefingScanInput {
  scanId: string | null;
  cropName: string | null;
  createdAt: string;
  category: string | null;
  confidenceLevel: string | null;
  recommendExpertConsult: boolean;
}

export interface BriefingContext {
  farmId: string | null;
  state: string | null;
  district: string | null;
  latitude: number | null;
  longitude: number | null;
  areaAcres: number | null;
  crops: string[];
  primaryCrop: string | null;
  /** Presence and age only — never NPK or pH. */
  latestSoil: { testedOn: string } | null;
  /** Never carries a disease label. */
  recentScans: BriefingScanInput[];
  locale: string;
}

/** What one agent branch produced. */
export type Signal =
  | { status: "ok"; asOf: string | null; data: Record<string, unknown> }
  | { status: "skipped"; reasonKey: string }
  | { status: "unavailable"; reasonKey: string };

export type SignalBundle = Partial<Record<"weather" | "market" | "schemes", Signal>>;

const text = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : null;

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

function daysSince(iso: unknown, now: Date): number | null {
  const s = text(iso);
  if (!s) return null;
  const then = Date.parse(s.length === 10 ? s + "T00:00:00Z" : s);
  if (Number.isNaN(then)) return null;
  return Math.floor((now.getTime() - then) / 86400000);
}

/**
 * Groups quotes that are actually comparable: same variety AND same
 * grade.
 *
 * WHY THIS EXISTS. AGMARKNET returns several varieties of one commodity
 * side by side, and their prices are not comparable. Madurai onion on
 * 2026-09-24 reported Bellary at Rs 4,500 and Onion Green at Rs 8,700;
 * Pune reported Local onion at Rs 2,850 and "Other" at Rs 10 in the very
 * same mandi. Ranking those together and calling the gap a spread tells
 * a farmer they could get 87x more by changing venue, when the real
 * difference is that it is a different product. A spread is only
 * meaningful between venues selling the same thing.
 */
export function groupComparableQuotes(
  quotes: unknown
): { variety: string | null; grade: string | null; quotes: { market: string; price: number }[] }[] {
  const list = Array.isArray(quotes) ? quotes : [];
  const groups: { variety: string | null; grade: string | null; quotes: { market: string; price: number }[] }[] = [];
  const index: Record<string, number> = {};
  for (const q of list) {
    if (!q || typeof q !== "object") continue;
    const row = q as Record<string, unknown>;
    const price =
      typeof row.modalPrice === "number" && Number.isFinite(row.modalPrice) ? row.modalPrice : null;
    // A quote with no usable price cannot take part in a comparison, and
    // a quote with no mandi name cannot be named in one.
    if (price === null) continue;
    const market = typeof row.market === "string" ? row.market.trim() : "";
    if (market === "") continue;

    const variety =
      typeof row.variety === "string" && row.variety.trim() !== "" ? row.variety.trim() : null;
    const grade = typeof row.grade === "string" && row.grade.trim() !== "" ? row.grade.trim() : null;
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

/**
 * Applies every rule to the context and signals.
 *
 * A signal counts as usable only when the agent itself said "ok" — an
 * unavailable or skipped agent contributes no rule, and the farm-record
 * rules below state the reason where the farmer can act on it.
 */
export function applyRules(
  context: BriefingContext,
  signals: SignalBundle,
  now: Date
): DecisionAction[] {
  const ok = (name: "weather" | "market" | "schemes"): Record<string, unknown> | null => {
    const s = signals[name];
    return s && s.status === "ok" && s.data && typeof s.data === "object" ? s.data : null;
  };

  const actions: (DecisionAction & { _i: number })[] = [];
  let index = 0;
  const emit = (
    key: string,
    params: Record<string, string | number> | null,
    priority: DecisionPriority,
    sourceAgent: DecisionSourceAgent
  ) => {
    actions.push({ key, params: params || null, priority, sourceAgent, _i: index++ });
  };

  // --- weather --------------------------------------------------------
  // The agent already emits descriptive threshold flags. These are
  // restated and prioritised; nothing is added to them.
  const weather = ok("weather");
  if (weather) {
    const flags = Array.isArray(weather.advisories) ? (weather.advisories as string[]) : [];
    for (const rule of WEATHER_FLAG_RULES) {
      if (flags.indexOf(rule.flag) !== -1) emit(rule.key, null, rule.priority, "weather");
    }
  }

  // --- market ---------------------------------------------------------
  const market = ok("market");
  if (market) {
    const crop = text(market.commodity) || text(context.primaryCrop);
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

      // A spread is only a fact when both ends are the same product.
      // This is still not advice to go anywhere: transport, quantity and
      // relationships are things this system knows nothing about.
      let widest: { group: (typeof groups)[number]; low: { market: string; price: number }; high: { market: string; price: number } } | null = null;
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

  // --- diagnosis ------------------------------------------------------
  // Restates what the Crop Diagnosis Agent itself flagged. The disease
  // label never reaches here, so no treatment can be implied.
  const scans = Array.isArray(context.recentScans) ? context.recentScans : [];
  const recent = scans.filter((s) => {
    const age = daysSince(s && s.createdAt, now);
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

  // --- schemes --------------------------------------------------------
  // "matched" means nothing recorded contradicts the scheme. It is never
  // eligibility, and the label the farmer reads says so.
  const schemes = ok("schemes");
  if (schemes) {
    const matches = Array.isArray(schemes.matches) ? (schemes.matches as { group?: string }[]) : [];
    const matched = matches.filter((m) => m && m.group === "matched");
    if (matched.length > 0) emit("schemesMatched", { count: matched.length }, "medium", "schemes");

    const skipped = num(schemes.stateSchemesSkipped);
    if (skipped !== null && skipped > 0) {
      emit("schemesStateUnknown", { count: skipped }, "low", "schemes");
    }
  }

  // --- soil -----------------------------------------------------------
  // Only the presence and age of a record. No NPK, no pH, no guidance:
  // reading soil chemistry into advice is a job for an agronomist.
  const soil = context.latestSoil;
  if (!soil || !text(soil.testedOn)) {
    emit("soilDataMissing", null, "low", "soil");
  } else {
    const age = daysSince(soil.testedOn, now);
    if (age !== null && age > SOIL_STALE_DAYS) {
      emit("soilDataStale", { testedOn: text(soil.testedOn) as string, years: Math.floor(age / 365) }, "low", "soil");
    }
  }

  // --- farm record completeness ---------------------------------------
  // Each of these is the reason a signal above could not run, stated
  // where the farmer can act on it.
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

  return actions.map((a) => ({
    key: a.key,
    params: a.params,
    priority: a.priority,
    sourceAgent: a.sourceAgent
  }));
}

/**
 * Wraps the rule output in the DataResult contract.
 *
 * generatedAt is when this ran; each signal carries its own asOf,
 * because the agents were consulted at slightly different moments and
 * one "as of" for all of them would be a fiction.
 *
 * Every agent gets an entry in `signals` whether or not it succeeded. A
 * briefing that quietly omits the agents that failed would look like a
 * complete picture of the farm when it is not.
 */
export function buildBriefing(
  context: BriefingContext,
  signals: SignalBundle,
  actions: DecisionAction[],
  now: Date
): DataResult<FarmBriefing> {
  const statusOf = (name: DecisionSourceAgent): SignalStatus => {
    const s = (signals as Record<string, Signal | undefined>)[name];
    if (!s || typeof s !== "object") {
      return { status: "unavailable", reasonKey: "notConsulted", asOf: null };
    }
    if (s.status === "ok") return { status: "ok", reasonKey: null, asOf: text(s.asOf) };
    if (s.status === "skipped") {
      return { status: "skipped", reasonKey: text(s.reasonKey) || "skipped", asOf: null };
    }
    return { status: "unavailable", reasonKey: text(s.reasonKey) || "agentUnavailable", asOf: null };
  };

  const out = {} as Record<DecisionSourceAgent, SignalStatus>;
  for (const a of AGENTS) out[a] = statusOf(a);

  // diagnosis and soil are read from what the frontend supplied rather
  // than from an agent call, so their status is about the farmer's own
  // records, not about a service being up.
  const scans = Array.isArray(context.recentScans) ? context.recentScans : [];
  out.diagnosis = scans.length > 0
    ? { status: "ok", reasonKey: null, asOf: text(scans[0].createdAt) }
    : { status: "skipped", reasonKey: "noRecentScans", asOf: null };

  const soil = context.latestSoil;
  out.soil = soil && text(soil.testedOn)
    ? { status: "ok", reasonKey: null, asOf: text(soil.testedOn) }
    : { status: "skipped", reasonKey: "noSoilRecord", asOf: null };

  out.farm = { status: "ok", reasonKey: null, asOf: null };

  const at = now.toISOString();
  return {
    status: "ok",
    asOf: at,
    source: SOURCE,
    data: {
      farmId: text(context.farmId) as string,
      generatedAt: at,
      primaryCrop: text(context.primaryCrop),
      signals: out,
      actions,
      // Carried as a key, not prose, so it reads in the farmer's own
      // language like everything else on the card.
      disclaimer: "decision.disclaimer"
    }
  };
}

/**
 * The signal bundle or the farm context was unreadable, so there is
 * nothing truthful to brief on.
 */
export function briefingUnavailable(): DataResult<FarmBriefing> {
  return {
    status: "unavailable",
    reason: "Your farm briefing could not be prepared right now. Please try again."
  };
}

/**
 * Without a context we cannot say which farm this is about, and an
 * unattributed briefing is worse than none.
 */
export function isUsable(context: BriefingContext | null): boolean {
  return !!(context && text(context.farmId));
}
