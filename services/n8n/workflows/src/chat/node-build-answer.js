// ---------------------------------------------------------------------
// ANSWER BUILDER — keys and params only, never prose.
//
// This node cannot produce a sentence. It chooses an `answerKey` and
// supplies `params` drawn strictly from fields a source actually
// returned; the frontend renders `chat.answer.<answerKey>` in the
// farmer's language. That is what keeps four languages of agricultural
// wording in reviewable locale files, and what makes a chemical name, a
// dosage or a treatment instruction impossible to emit.
//
// RULES THIS NODE MUST KEEP:
//  1. A param is set only when the source actually reported it. Nothing
//     is defaulted, substituted or inferred. A missing reading is
//     reported as "not recorded", never as zero.
//  2. An unavailable source produces an unavailable answer. There is no
//     "the service is down, but generally..." path.
//  3. Soil values are REPORTED, never interpreted. This node may say
//     what the farmer recorded; it may not derive a fertiliser
//     recommendation, a dosage or any agronomic prescription from it.
//     There is no rule below that reads a nutrient value and branches on
//     whether it is high or low — that is the line between reporting a
//     record and giving advice.
//  4. Scheme answers report the `matched` count and that conditions
//     remain to be checked. Never eligibility.
//  5. A diagnosis answer restates what the Crop Diagnosis Agent itself
//     flagged. The disease label never reaches this workflow.
// ---------------------------------------------------------------------

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

const classified = $('Classify Intent').first().json;
const intent = classified.intent;
const context = classified.context || {};
const cropSlot = classified.cropSlot;

const text = (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Reads a fan-out branch without throwing when it did not execute. */
const readBranch = (nodeName) => {
  try {
    const item = $(nodeName).first();
    return item && item.json ? item.json : null;
  } catch (e) {
    return null;
  }
};

const okData = (payload) =>
  payload && payload.status === "ok" && payload.data && typeof payload.data === "object"
    ? payload.data
    : null;

const signalOf = (payload) => {
  if (!payload) return { status: "unavailable", reasonKey: "notConsulted", asOf: null };
  if (payload.status === "ok") {
    return { status: "ok", reasonKey: null, asOf: text(payload.asOf) };
  }
  return { status: "unavailable", reasonKey: "agentUnavailable", asOf: null };
};

/** Only params with a real value survive — see rule 1. */
const clean = (obj) => {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (typeof v === "string" && v.trim() !== "") out[k] = v.trim();
  }
  return Object.keys(out).length > 0 ? out : null;
};

const answer = (answerKey, params, sources, signals) => ({
  intent,
  answerKey,
  params: params ? clean(params) : null,
  sources: sources || [],
  signals: signals || {}
});

let result;

if (intent === "weather.today" || intent === "weather.forecast") {
  const payload = readBranch("Call 'Weather - Core'");
  const data = okData(payload);
  const signals = { weather: signalOf(payload) };

  if (!data) {
    result = answer("sourceUnavailable", { source: "weather" }, ["weather"], signals);
  } else if (intent === "weather.forecast") {
    const days = Array.isArray(data.forecast) ? data.forecast : [];
    if (days.length === 0) {
      result = answer("sourceUnavailable", { source: "weather" }, ["weather"], signals);
    } else {
      const d = days[0];
      result = answer(
        "weatherForecast",
        {
          days: days.length,
          date: text(d.date),
          maxTemp: num(d.temperatureMaxC),
          minTemp: num(d.temperatureMinC),
          rainChance: num(d.precipitationProbabilityMaxPct)
        },
        ["weather"],
        signals
      );
    }
  } else {
    const c = data.current || {};
    const temp = num(c.temperatureC);
    // A reading the source omitted means the "full" template would have
    // a hole in it, so a reduced template is used instead of a dash.
    result =
      temp === null
        ? answer("weatherTodayPartial", { code: num(c.weatherCode) }, ["weather"], signals)
        : answer(
            "weatherToday",
            {
              temp,
              humidity: num(c.relativeHumidityPct),
              wind: num(c.windSpeedKph),
              code: num(c.weatherCode)
            },
            ["weather"],
            signals
          );
  }
} else if (intent === "market.price") {
  const payload = readBranch("Call 'Market - Core'");
  const data = okData(payload);
  const signals = { market: signalOf(payload) };

  if (!data) {
    result = answer("sourceUnavailable", { source: "market" }, ["market"], signals);
  } else {
    // Grouped by variety and grade, because prices for different
    // varieties of one commodity are not comparable — quoting the
    // highest across all of them would answer "what is tomato worth"
    // with the price of a different product.
    const groups = groupComparableQuotes(data.quotes);
    if (groups.length === 0) {
      result = answer(
        "marketPriceNoQuotes",
        { crop: text(data.commodity) || cropSlot, district: text(data.district) },
        ["market"],
        signals
      );
    } else {
      let main = groups[0];
      for (const g of groups) if (g.quotes.length > main.quotes.length) main = g;

      let best = main.quotes[0];
      for (const q of main.quotes) if (q.price > best.price) best = q;

      result = answer(
        main.variety ? "marketPriceVariety" : "marketPrice",
        {
          crop: text(data.commodity) || cropSlot,
          variety: main.variety || "",
          price: best.price,
          market: best.market,
          district: text(data.district),
          reportedOn: text(data.latestReportedOn),
          count: main.quotes.length
        },
        ["market"],
        signals
      );
    }
  }
} else if (intent === "schemes.list") {
  const payload = readBranch("Call 'Schemes - Core'");
  const data = okData(payload);
  const signals = { schemes: signalOf(payload) };

  if (!data) {
    result = answer("sourceUnavailable", { source: "schemes" }, ["schemes"], signals);
  } else {
    const matches = Array.isArray(data.matches) ? data.matches : [];
    const matched = matches.filter((m) => m && m.group === "matched");
    result =
      matched.length === 0
        ? answer("schemesNone", null, ["schemes"], signals)
        : // "count matched, conditions still to check" — never eligibility.
          answer("schemesList", { count: matched.length }, ["schemes"], signals);
  }
} else if (intent === "briefing.summary") {
  const payload = readBranch("Call 'Orchestrator - Core'");
  const data = okData(payload);
  const signals = { farm: signalOf(payload) };

  if (!data) {
    result = answer("sourceUnavailable", { source: "farm" }, ["farm"], signals);
  } else {
    const actions = Array.isArray(data.actions) ? data.actions : [];
    const high = actions.filter((a) => a && a.priority === "high").length;
    result =
      actions.length === 0
        ? answer("briefingNothing", null, ["farm"], signals)
        : answer("briefingSummary", { total: actions.length, high }, ["farm"], signals);
  }
} else if (intent === "diagnosis.recent") {
  // Answered from the scans the frontend supplied. No Crop Diagnosis
  // inference is triggered — this workflow has no route to it at all.
  const scans = Array.isArray(context.recentScans) ? context.recentScans : [];
  const signals = {
    diagnosis:
      scans.length > 0
        ? { status: "ok", reasonKey: null, asOf: text(scans[0].createdAt) }
        : { status: "skipped", reasonKey: "noRecentScans", asOf: null }
  };

  if (scans.length === 0) {
    result = answer("diagnosisNone", null, ["diagnosis"], signals);
  } else {
    const latest = scans[0];
    const params = {
      crop: text(latest.cropName),
      date: text(latest.createdAt),
      confidence: text(latest.confidenceLevel),
      count: scans.length
    };
    result = latest.recommendExpertConsult
      ? answer("diagnosisNeedsExpert", params, ["diagnosis"], signals)
      : answer("diagnosisRecent", params, ["diagnosis"], signals);
  }
} else if (intent === "soil.status") {
  // Reports what the farmer recorded. Note there is no branch here on
  // whether a value is high or low: reporting a record is allowed,
  // interpreting it into a recommendation is not (rule 3).
  const soil = context.latestSoil;
  const signals = {
    soil: soil
      ? { status: "ok", reasonKey: null, asOf: text(soil.testedOn) }
      : { status: "skipped", reasonKey: "noSoilRecord", asOf: null }
  };

  if (!soil) {
    result = answer("soilNone", null, ["soil"], signals);
  } else {
    // Fields the farmer left blank stay absent, so the rendered answer
    // lists only what was actually recorded.
    result = answer(
      "soilStatus",
      {
        testedOn: text(soil.testedOn),
        soilType: text(soil.soilType),
        ph: num(soil.ph),
        nitrogen: num(soil.nitrogen),
        phosphorus: num(soil.phosphorus),
        potassium: num(soil.potassium),
        organicCarbon: num(soil.organicCarbon)
      },
      ["soil"],
      signals
    );
  }
} else if (intent === "farm.info") {
  const signals = { farm: { status: "ok", reasonKey: null, asOf: null } };
  const hasLocation = context.state && context.district;
  result = answer(
    hasLocation ? "farmInfo" : "farmInfoNoLocation",
    {
      state: text(context.state),
      district: text(context.district),
      areaAcres: num(context.areaAcres),
      cropCount: Array.isArray(context.crops) ? context.crops.length : 0,
      crops: Array.isArray(context.crops) ? context.crops.join(", ") : ""
    },
    ["farm"],
    signals
  );
} else {
  // Unknown, or market with no crop to ask about. Explains what the
  // chatbot can answer instead of guessing at the question.
  result = answer(
    intent === "market.price" ? "marketNoCrop" : "unknown",
    null,
    [],
    {}
  );
}

return [
  {
    json: {
      status: "ok",
      asOf: new Date().toISOString(),
      source: "agri-one-chat",
      data: result
    }
  }
];
