// Normalises the farm context the frontend supplied and decides which
// agents are worth calling at all.
//
// n8n never reads Supabase here: everything about the farm arrives in
// the request, already scoped to the signed-in farmer by row-level
// security on the frontend's own queries. That keeps this workflow
// holding no database credential.
//
// Readiness is computed rather than discovered by failure: calling
// Weather - Core with no coordinates would burn a round trip to learn
// something the farm record already told us, and would report "the
// weather service failed" when the truth is "this farm has no location
// saved" — a difference the farmer can act on.

const input = $input.first() ? $input.first().json : {};

const text = (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

const num = (v) => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
};

// Arrays arrive JSON-stringified because Execute Workflow stringifies
// its inputs. Anything unparseable degrades to empty rather than
// throwing — a missing scan list is a thinner briefing, not an error.
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

const state = text(input.state);
const district = text(input.district);
const latitude = num(input.latitude);
const longitude = num(input.longitude);
const crops = parseArray(input.crops).map((c) => text(c)).filter((c) => c !== null);
const primaryCrop = text(input.primaryCrop) || (crops.length > 0 ? crops[0] : null);

const rawScans = parseArray(input.recentScans);
// Only the fields the rules are permitted to use. The disease label and
// disclaimer text are never sent by the frontend and are not accepted
// here either, so no rule can turn a diagnosis into a treatment.
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

const rawSoil = parseObject(input.latestSoil);
// Presence and age only — NPK and pH are deliberately not part of this
// contract, so soil chemistry cannot become advice.
const latestSoil = rawSoil && text(rawSoil.testedOn) ? { testedOn: text(rawSoil.testedOn) } : null;

const context = {
  farmId: text(input.farmId),
  state,
  district,
  latitude,
  longitude,
  areaAcres: num(input.areaAcres),
  crops,
  primaryCrop,
  latestSoil,
  recentScans,
  locale: text(input.locale) || "en"
};

const weatherReady = latitude !== null && longitude !== null;
const marketReady = state !== null && district !== null && primaryCrop !== null;

return [
  {
    json: {
      context,
      contextJson: JSON.stringify(context),
      locale: context.locale,
      weatherReady,
      marketReady,
      weatherSkipReason: weatherReady ? null : "noCoordinates",
      marketSkipReason: !state || !district ? "noDistrict" : !primaryCrop ? "noCrop" : null
    }
  }
];
