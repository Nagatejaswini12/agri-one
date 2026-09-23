// Normalises the chat request and narrows it to exactly what the
// supported intents need.
//
// n8n reads no Supabase table: the farm context arrives in the request,
// already scoped to the signed-in farmer by row-level security on the
// frontend's own queries.
//
// The soil projection carries the farmer's recorded values because
// `soil.status` reports them back as facts. It never becomes advice:
// no rule or template may turn a nutrient reading into a fertiliser
// recommendation, a dosage or a treatment — see node-build-answer.js.
//
// The scan projection deliberately carries NO disease label, only what
// `diagnosis.recent` needs. The label never reaches this workflow, so
// the chatbot cannot turn a diagnosis into a treatment even by accident.

const input = $input.first() ? $input.first().json : {};

const text = (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

const num = (v) => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
};

const parseArray = (v) => {
  let raw = v;
  if (typeof raw === "string") {
    const s = raw.trim();
    if (s === "") return [];
    try {
      raw = JSON.parse(s);
    } catch (e) {
      return [];
    }
  }
  return Array.isArray(raw) ? raw : [];
};

const parseObject = (v) => {
  let raw = v;
  if (typeof raw === "string") {
    const s = raw.trim();
    if (s === "" || s === "null") return null;
    try {
      raw = JSON.parse(s);
    } catch (e) {
      return null;
    }
  }
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : null;
};

const crops = parseArray(input.crops).map((c) => text(c)).filter((c) => c !== null);
const primaryCrop = text(input.primaryCrop) || (crops.length > 0 ? crops[0] : null);

const rawSoil = parseObject(input.latestSoil);
// A value the farmer did not record stays null. It is never substituted,
// and an absent reading is reported as "not recorded", never as zero.
const latestSoil = rawSoil
  ? {
      soilType: text(rawSoil.soilType),
      ph: num(rawSoil.ph),
      nitrogen: num(rawSoil.nitrogen),
      phosphorus: num(rawSoil.phosphorus),
      potassium: num(rawSoil.potassium),
      organicCarbon: num(rawSoil.organicCarbon),
      testedOn: text(rawSoil.testedOn)
    }
  : null;

const rawScans = parseArray(input.recentScans);
const recentScans = [];
for (const s of rawScans) {
  if (!s || typeof s !== "object") continue;
  const createdAt = text(s.createdAt);
  if (!createdAt) continue;
  recentScans.push({
    scanId: text(s.scanId),
    cropName: text(s.cropName),
    createdAt,
    category: text(s.category),
    confidenceLevel: text(s.confidenceLevel),
    recommendExpertConsult: s.recommendExpertConsult === true
  });
}
recentScans.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));

const context = {
  farmId: text(input.farmId),
  state: text(input.state),
  district: text(input.district),
  latitude: num(input.latitude),
  longitude: num(input.longitude),
  areaAcres: num(input.areaAcres),
  crops,
  primaryCrop,
  latestSoil,
  recentScans
};

const question = text(input.text);
const locale = text(input.locale) || "en";

return [
  {
    json: {
      usable: question !== null,
      question: question || "",
      locale,
      context,
      contextJson: JSON.stringify(context)
    }
  }
];
