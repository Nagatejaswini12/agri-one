// Parses the signal bundle the Orchestrator collected.
//
// Every agent runs outside this workflow and can fail independently, so
// nothing here assumes a signal arrived or that it arrived well-formed.
// An unreadable signal becomes "unavailable" with a reason key rather
// than being dropped: a farmer must be able to see that the weather was
// not consulted, not just notice the briefing looks short.

const input = $input.first() ? $input.first().json : {};

const parseJson = (v, fallback) => {
  if (v && typeof v === "object") return v;
  if (typeof v === "string" && v.trim() !== "") {
    try {
      return JSON.parse(v);
    } catch (e) {
      return fallback;
    }
  }
  return fallback;
};

const signals = parseJson(input.signals, null);
const context = parseJson(input.context, null);

const text = (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

// Without a context we cannot say which farm this is about, and an
// unattributed briefing is worse than none.
const usable = !!(signals && typeof signals === "object" && context && text(context.farmId));

return [
  {
    json: {
      usable,
      locale: text(input.locale) || "en",
      context: context || {},
      signals: signals || {}
    }
  }
];
