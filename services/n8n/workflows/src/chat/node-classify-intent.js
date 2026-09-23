// ---------------------------------------------------------------------
// DETERMINISTIC MULTILINGUAL INTENT CLASSIFIER.
//
// Maps a farmer's question onto one of nine fixed intents. This is a
// closed enum, never free text, so the worst thing a misclassification
// can do is answer the wrong *true* question — it can never invent a
// fact. That property is why no LLM is needed here in v1.
//
// An LLM classifier could be wired in ahead of this node later: it would
// have to emit the same { intent, cropSlot } shape and nothing else, and
// this node stays as the fallback for when it is unavailable or not
// configured. Nothing downstream would change.
//
// Keyword tables live in this workflow rather than in the locale
// bundles: these are matching rules, not farmer-facing copy, and they
// must not drift when someone rewords a UI string.
//
// Matching is accent- and case-insensitive on a letters-only reduction,
// the same discipline the Market agent uses for district names.
// ---------------------------------------------------------------------

const KEYWORDS = {
  forecast: {
    en: ["forecast", "next few days", "coming days", "tomorrow", "this week"],
    ta: ["முன்னறிவிப்பு", "நாளை", "வரும் நாட்கள்"],
    te: ["సూచన", "రేపు", "రాబోయే"],
    hi: ["पूर्वानुमान", "कल", "आने वाले"]
  },
  weather: {
    en: ["weather", "rain", "temperature", "hot", "wind", "climate"],
    ta: ["வானிலை", "மழை", "வெப்பநிலை", "காற்று"],
    te: ["వాతావరణం", "వర్షం", "ఉష్ణోగ్రత", "గాలి"],
    hi: ["मौसम", "बारिश", "तापमान", "हवा"]
  },
  market: {
    en: ["price", "rate", "market", "mandi", "sell", "selling", "cost of"],
    ta: ["விலை", "சந்தை", "விற்க", "மண்டி"],
    te: ["ధర", "మార్కెట్", "అమ్మ", "మండి"],
    hi: ["भाव", "कीमत", "मंडी", "बाज़ार", "बाजार", "बेच"]
  },
  schemes: {
    en: ["scheme", "subsidy", "government", "yojana", "benefit", "apply"],
    ta: ["திட்டம்", "திட்டங்கள்", "மானியம்", "அரசு"],
    te: ["పథకం", "పథకాలు", "సబ్సిడీ", "ప్రభుత్వ"],
    hi: ["योजना", "योजनाएं", "सब्सिडी", "सरकारी", "अनुदान"]
  },
  diagnosis: {
    en: ["scan", "disease", "diagnos", "sick", "infected", "leaf", "spot"],
    ta: ["ஸ்கேன்", "நோய்", "பாதிப்பு", "இலை"],
    te: ["స్కాన్", "వ్యాధి", "తెగులు", "ఆకు"],
    hi: ["स्कैन", "बीमारी", "रोग", "पत्ती"]
  },
  soil: {
    en: ["soil", "ph", "nitrogen", "phosphorus", "potassium", "npk", "organic carbon"],
    ta: ["மண்", "மண்ணின்", "தழைச்சத்து"],
    te: ["నేల", "మట్టి"],
    hi: ["मिट्टी", "मृदा"]
  },
  farm: {
    en: ["my farm", "farm detail", "land", "acre", "how big", "location"],
    ta: ["பண்ணை", "நிலம்", "ஏக்கர்"],
    te: ["క్షేత్రం", "భూమి", "ఎకరా"],
    hi: ["खेत", "ज़मीन", "जमीन", "एकड़"]
  },
  briefing: {
    en: ["summary", "briefing", "what should", "today", "overview", "anything"],
    ta: ["சுருக்கம்", "இன்று", "என்ன செய்ய"],
    te: ["సారాంశం", "ఈరోజు", "ఏమి చేయాలి"],
    hi: ["सारांश", "आज", "क्या करूं", "क्या करें"]
  }
};

// Order matters: the first match wins, so the more specific topics are
// tested before the catch-all "briefing" words like "today".
const PRIORITY = ["forecast", "weather", "market", "schemes", "diagnosis", "soil", "farm", "briefing"];

const data = $input.first().json;
const question = String(data.question || "");
const lower = question.toLowerCase();

/** Letters and digits only, so punctuation and spacing cannot block a match. */
const reduce = (s) => String(s).toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const reducedQuestion = reduce(question);

const hits = (topic) => {
  const table = KEYWORDS[topic];
  for (const lang of Object.keys(table)) {
    for (const word of table[lang]) {
      if (lower.indexOf(word.toLowerCase()) !== -1) return true;
      if (reduce(word).length >= 3 && reducedQuestion.indexOf(reduce(word)) !== -1) return true;
    }
  }
  return false;
};

let topic = null;
for (const candidate of PRIORITY) {
  if (hits(candidate)) {
    topic = candidate;
    break;
  }
}

// The crop slot is matched against the farm's OWN crops, which the
// request already carries. That avoids needing an agricultural
// vocabulary, and it means the chatbot can only ever price a crop the
// farmer actually grows.
const crops = Array.isArray(data.context.crops) ? data.context.crops : [];
let cropSlot = null;
for (const crop of crops) {
  if (reducedQuestion.indexOf(reduce(crop)) !== -1) {
    cropSlot = crop;
    break;
  }
}
if (!cropSlot) cropSlot = data.context.primaryCrop;

const INTENT_OF = {
  forecast: "weather.forecast",
  weather: "weather.today",
  market: "market.price",
  schemes: "schemes.list",
  diagnosis: "diagnosis.recent",
  soil: "soil.status",
  farm: "farm.info",
  briefing: "briefing.summary"
};

const intent = topic ? INTENT_OF[topic] : "unknown";

// Which branch of the Switch handles it. "local" is answered entirely
// from the supplied context — note there is no route to Crop Diagnosis
// from anywhere in this workflow, so chat can never trigger an
// inference.
const ROUTE_OF = {
  "weather.today": "weather",
  "weather.forecast": "weather",
  "market.price": "market",
  "schemes.list": "schemes",
  "briefing.summary": "briefing"
};
const route = ROUTE_OF[intent] || "local";

// Market needs a crop to ask about; without one the answer says so
// rather than pricing something the farmer did not mention.
const finalRoute = route === "market" && !cropSlot ? "local" : route;

console.log("Chat intent:", JSON.stringify({ intent, route: finalRoute, cropSlot, locale: data.locale }));

return [
  {
    json: {
      intent,
      route: finalRoute,
      cropSlot,
      locale: data.locale,
      question,
      context: data.context,
      contextJson: data.contextJson
    }
  }
];
