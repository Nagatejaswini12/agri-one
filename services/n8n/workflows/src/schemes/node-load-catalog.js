// Normalizes the caller's inputs and emits the curated catalog for the
// rest of the pipeline. Nothing here reads the request to decide what a
// scheme says: the catalog is a fixed constant, so a crafted request can
// never introduce scheme content (see docs/api-contracts.md).

const input = $input.first() ? $input.first().json : {};

const text = (v) =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : null;

// areaAcres arrives as a string when the API workflow stringifies inputs;
// anything non-numeric stays null so the area criterion says
// "cannot check" rather than silently reading as 0 acres.
const num = (v) => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) {
    return Number(v);
  }
  return null;
};

// crops may arrive as a JSON string (Execute Workflow stringifies inputs),
// as a real array, or as a comma-separated list. Nothing is invented if
// none of those parse: the farmer simply has no crops recorded.
const parseCrops = (v) => {
  let raw = v;
  if (typeof raw === "string") {
    const s = raw.trim();
    if (s === "") return [];
    if (s.charAt(0) === "[") {
      try {
        raw = JSON.parse(s);
      } catch (e) {
        raw = s.split(",");
      }
    } else {
      raw = s.split(",");
    }
  }
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw) {
    const name =
      typeof item === "string"
        ? item
        : item && typeof item === "object"
          ? item.cropName || item.crop_name || item.name
          : null;
    const cleaned = text(name);
    if (cleaned) out.push(cleaned);
  }
  return out;
};

return [
  {
    json: {
      askedState: text(input.state),
      askedDistrict: text(input.district),
      areaAcres: num(input.areaAcres),
      crops: parseCrops(input.crops),
      locale: text(input.locale) || "en",
      catalogVersion: CATALOG_VERSION,
      catalogCount: CATALOG.length,
      catalog: CATALOG
    }
  }
];
