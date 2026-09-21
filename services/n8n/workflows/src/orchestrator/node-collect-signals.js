// Gathers the three agent branches into one signal bundle.
//
// The Merge upstream is a synchronisation join, not a data path: the
// branches are read here by node name instead, so each signal keeps its
// identity regardless of merge ordering or how many items a branch
// produced.
//
// A branch that never executed (its readiness gate sent flow to the Skip
// node) throws on access, which is caught and turned into a "skipped"
// signal carrying the reason the gate computed. A branch that ran but
// failed — every Call node has onError: continueRegularOutput — lands
// here as an item that is not a valid DataResult, and becomes
// "unavailable". One dead agent must never cost the farmer the whole
// briefing.

const inputs = $('Build Agent Inputs').first().json;

/** Reads one branch, never throwing. */
const readBranch = (nodeName) => {
  try {
    const item = $(nodeName).first();
    return item && item.json ? item.json : null;
  } catch (e) {
    return null;
  }
};

const toSignal = (payload, skipReason) => {
  if (payload === null) {
    return skipReason
      ? { status: "skipped", reasonKey: skipReason }
      : { status: "unavailable", reasonKey: "notConsulted" };
  }
  if (payload.status === "ok" && payload.data && typeof payload.data === "object") {
    return { status: "ok", asOf: payload.asOf || null, data: payload.data };
  }
  if (payload.status === "unavailable") {
    // The agent's own reason is a farmer-facing sentence; the briefing
    // renders a translated key instead, so only the fact is kept.
    return { status: "unavailable", reasonKey: "agentUnavailable" };
  }
  if (payload.status === "skipped") {
    return { status: "skipped", reasonKey: payload.reasonKey || "skipped" };
  }
  return { status: "unavailable", reasonKey: "agentUnavailable" };
};

const weatherCalled = readBranch("Call 'Weather - Core'");
const weatherSkipped = readBranch("Skip Weather");
const marketCalled = readBranch("Call 'Market - Core'");
const marketSkipped = readBranch("Skip Market");
const schemesCalled = readBranch("Call 'Schemes - Core'");

const signals = {
  weather: weatherCalled
    ? toSignal(weatherCalled, null)
    : toSignal(null, (weatherSkipped && weatherSkipped.reasonKey) || inputs.weatherSkipReason),
  market: marketCalled
    ? toSignal(marketCalled, null)
    : toSignal(null, (marketSkipped && marketSkipped.reasonKey) || inputs.marketSkipReason),
  schemes: toSignal(schemesCalled, null)
};

console.log(
  "Orchestrator signals:",
  JSON.stringify({
    weather: signals.weather.status,
    market: signals.market.status,
    schemes: signals.schemes.status
  })
);

return [
  {
    json: {
      signals: JSON.stringify(signals),
      context: inputs.contextJson,
      locale: inputs.locale
    }
  }
];
