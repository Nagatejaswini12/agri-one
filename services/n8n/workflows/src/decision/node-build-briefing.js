// Wraps the rule output in the DataResult contract
// (packages/shared-types). generatedAt is when this ran; each signal
// carries its own asOf, because the agents were consulted at slightly
// different moments and one "as of" for all of them would be a fiction.
//
// Every agent gets an entry in `signals` whether or not it succeeded.
// A briefing that quietly omits the agents that failed would look like a
// complete picture of the farm when it is not.

const SOURCE = "agri-one-orchestrator";
const AGENTS = ["weather", "market", "schemes", "diagnosis", "soil", "farm"];

const data = $input.first().json;
const context = data.context || {};
const raw = data.signals || {};

const text = (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

const statusOf = (name) => {
  const s = raw[name];
  if (!s || typeof s !== "object") {
    return { status: "unavailable", reasonKey: "notConsulted", asOf: null };
  }
  if (s.status === "ok") {
    return { status: "ok", reasonKey: null, asOf: text(s.asOf) };
  }
  if (s.status === "skipped") {
    return { status: "skipped", reasonKey: text(s.reasonKey) || "skipped", asOf: null };
  }
  return { status: "unavailable", reasonKey: text(s.reasonKey) || "agentUnavailable", asOf: null };
};

const signals = {};
for (const a of AGENTS) signals[a] = statusOf(a);

// diagnosis and soil are read from what the frontend supplied rather
// than from an agent call, so their status is about the farmer's own
// records, not about a service being up.
const scans = Array.isArray(context.recentScans) ? context.recentScans : [];
signals.diagnosis = scans.length > 0
  ? { status: "ok", reasonKey: null, asOf: text(scans[0].createdAt) }
  : { status: "skipped", reasonKey: "noRecentScans", asOf: null };

const soil = context.latestSoil;
signals.soil = soil && text(soil.testedOn)
  ? { status: "ok", reasonKey: null, asOf: text(soil.testedOn) }
  : { status: "skipped", reasonKey: "noSoilRecord", asOf: null };

signals.farm = { status: "ok", reasonKey: null, asOf: null };

return [
  {
    json: {
      status: "ok",
      asOf: new Date().toISOString(),
      source: SOURCE,
      data: {
        farmId: text(context.farmId),
        generatedAt: new Date().toISOString(),
        primaryCrop: text(context.primaryCrop),
        signals,
        actions: Array.isArray(data.actions) ? data.actions : [],
        // Carried as a key, not prose, so it reads in the farmer's own
        // language like everything else on the card.
        disclaimer: "decision.disclaimer"
      }
    }
  }
];
