import type { DataResult, MarketPriceQuote, MarketSnapshot } from "@agri-one/shared-types";

/**
 * AGMARKNET's daily mandi snapshot, resolved and mapped.
 *
 * A direct port of what the n8n Market workflow did, so moving the call
 * off n8n changes where the request is made and nothing about what a
 * farmer is told. The n8n workflow is left in place and untouched.
 *
 * Pure: no I/O, which is what makes the district resolution and the
 * price mapping testable without a key or a network.
 */

/** AGMARKNET district values, keyed by its state spelling. */
export const DISTRICT_MAP: Record<string, string[]> = {
    "Andhra Pradesh": [
      "Alluri Sitharama Raju",
      "Anakapally",
      "Ananthapuramu",
      "Annamayya",
      "Bapatla",
      "Dr.B.R.A.Konaseema",
      "East Godavari",
      "Eluru",
      "Kakinada",
      "Markapuram",
      "NTR",
      "Nandyal",
      "Palnadu",
      "Prakasam",
      "SPSR Nellore",
      "Srikakulam",
      "Visakhapatnam",
      "YSR Kadapa"
    ],
    "Assam": [
      "Tinsukia"
    ],
    "Bihar": [
      "Begusarai",
      "Bhagalpur",
      "Buxar",
      "Chhapra",
      "Madhubani",
      "Sheikhpura"
    ],
    "Chattisgarh": [
      "Kanker",
      "Kondagaon",
      "Manendragarh Chirmiri Bhartpur",
      "Raipur",
      "Sarangarh Bilaigarh",
      "Surajpur"
    ],
    "Gujarat": [
      "Ahmedabad",
      "Amreli",
      "Narmada",
      "Rajkot"
    ],
    "Haryana": [
      "Faridabad",
      "Gurgaon",
      "Hissar",
      "Jind",
      "Kaithal",
      "Karnal",
      "Kurukshetra",
      "Mahendragarh-Narnaul",
      "Palwal",
      "Panipat",
      "Rewari",
      "Sirsa",
      "Sonipat",
      "Yamuna Nagar"
    ],
    "Himachal Pradesh": [
      "Kullu",
      "Mandi",
      "Solan"
    ],
    "Karnataka": [
      "Bengaluru South",
      "Bidar",
      "Chikkamagaluru",
      "Haveri",
      "Koppal",
      "Vijayanagara"
    ],
    "Keralam": [
      "Alappuzha",
      "Ernakulam",
      "Idukki",
      "Kollam",
      "Kottayam",
      "Kozhikode(Calicut)",
      "Malappuram",
      "Palakad",
      "Pathanamthitta",
      "Thirssur",
      "Thiruvananthapuram"
    ],
    "Madhya Pradesh": [
      "Agar Malwa",
      "Alirajpur",
      "Ashoknagar",
      "Badwani",
      "Balaghat",
      "Betul",
      "Bhind",
      "Bhopal",
      "Chhindwara",
      "Dewas",
      "Dhar",
      "Dindori",
      "Guna",
      "Gwalior",
      "Harda",
      "Indore",
      "Katni",
      "Khargone",
      "Mandla",
      "Mandsaur",
      "Morena",
      "Narmadapuram",
      "Narsinghpur",
      "Raisen",
      "Rajgarh",
      "Ratlam",
      "Rewa",
      "Sagar",
      "Satna",
      "Sehore",
      "Seoni",
      "Sidhi",
      "Tikamgarh",
      "Ujjain"
    ],
    "Maharashtra": [
      "Ahilyanagar",
      "Amarawati",
      "Chattrapati Sambhajinagar",
      "Dharashiv",
      "Gadchiroli",
      "Jalgaon",
      "Kolhapur",
      "Latur",
      "Nagpur",
      "Parbhani",
      "Pune",
      "Raigad",
      "Sangli",
      "Satara",
      "Solapur"
    ],
    "NCT of Delhi": [
      "Delhi"
    ],
    "Odisha": [
      "Angul",
      "Balasore",
      "Bargarh",
      "Bhadrak",
      "Bolangir",
      "Dhenkanal",
      "Ganjam",
      "Jharsuguda",
      "Kalahandi",
      "Keonjhar",
      "Khurda",
      "Mayurbhanja",
      "Puri",
      "Sundergarh"
    ],
    "Punjab": [
      "Amritsar",
      "Ferozpur",
      "Gurdaspur",
      "Hoshiarpur",
      "Jalandhar",
      "Kapurthala",
      "Ludhiana",
      "Patiala",
      "Sangrur",
      "Tarntaran"
    ],
    "Rajasthan": [
      "Bharatpur",
      "Hanumangarh",
      "Jalore",
      "Jhunjhunu",
      "Tonk"
    ],
    "Tamil Nadu": [
      "Ariyalur",
      "Chengalpattu",
      "Coimbatore",
      "Cuddalore",
      "Dharmapuri",
      "Dindigul",
      "Erode",
      "Kallakuruchi",
      "Kancheepuram",
      "Karur",
      "Krishnagiri",
      "Madurai",
      "Nagapattinam",
      "Nagercoil (Kannyiakumari)",
      "Namakkal",
      "Perambalur",
      "Pudukkottai",
      "Ramanathapuram",
      "Ranipet",
      "Salem",
      "Sivaganga",
      "Tenkasi",
      "Thanjavur",
      "The Nilgiris",
      "Theni",
      "Thiruchirappalli",
      "Thirunelveli",
      "Thirupathur",
      "Thirupur",
      "Thiruvannamalai",
      "Thiruvarur",
      "Thiruvellore",
      "Tuticorin",
      "Vellore",
      "Villupuram",
      "Virudhunagar"
    ],
    "Telangana": [
      "Bhadradri Kothagudem",
      "Hanumakonda",
      "Hyderabad",
      "Jogulamba Gadwal",
      "Karimnagar",
      "Khammam",
      "Medchal Malkajgiri",
      "Nagarkurnool",
      "Ranga Reddy",
      "Siddipet",
      "Wanaparthy",
      "Warangal"
    ],
    "Tripura": [
      "Dhalai",
      "Khowai",
      "North Tripura",
      "Sepahijala",
      "South Tripura"
    ],
    "Uttar Pradesh": [
      "Agra",
      "Aligarh",
      "Ambedkarnagar",
      "Amethi",
      "Amroha",
      "Auraiya",
      "Ayodhya",
      "Azamgarh",
      "Badaun",
      "Baghpat",
      "Bahraich",
      "Ballia",
      "Balrampur",
      "Banda",
      "Barabanki",
      "Bareilly",
      "Basti",
      "Bijnor",
      "Bulandshahar",
      "Chandauli",
      "Chitrakut",
      "Deoria",
      "Etah",
      "Etawah",
      "Farukhabad",
      "Fatehpur",
      "Firozabad",
      "Gautam Budh Nagar",
      "Ghaziabad",
      "Ghazipur",
      "Gonda",
      "Gorakhpur",
      "Hamirpur",
      "Hardoi",
      "Hathras",
      "Jalaun (Orai)",
      "Jaunpur",
      "Jhansi",
      "Kannuj",
      "Kanpur",
      "Kanpur Dehat",
      "Kasganj",
      "Kaushambi",
      "Khiri (Lakhimpur)",
      "Lakhimpur",
      "Lalitpur",
      "Lucknow",
      "Maharajganj",
      "Mahoba",
      "Mainpuri",
      "Mathura",
      "Meerut",
      "Mirzapur",
      "Muzaffarnagar",
      "Pillibhit",
      "Pratapgarh",
      "Prayagraj",
      "Raebarelli",
      "Rampur",
      "Saharanpur",
      "Sambhal",
      "Sant Kabir Nagar",
      "Shahjahanpur",
      "Shamli",
      "Shravasti",
      "Siddharth Nagar",
      "Sitapur",
      "Sonbhadra",
      "Unnao",
      "Varanasi"
    ],
    "Uttarakhand": [
      "Dehradoon",
      "Haridwar",
      "Nanital",
      "Udhamsinghnagar"
    ],
    "West Bengal": [
      "Bankura",
      "Birbhum",
      "Darjeeling",
      "Hooghly",
      "Kolkata",
      "North 24 Parganas",
      "Purba Bardhaman",
      "Puruliya",
      "Sounth 24 Parganas"
    ]
  };

/**
 * Names that are not spelling variants at all — a nickname, an article,
 * an administrative prefix. Each target is an AGMARKNET value.
 */
export const STATE_ALIASES: Record<string, string> = {
    "kerala": "Keralam",
    "orissa": "Odisha",
    "chhattisgarh": "Chattisgarh",
    "delhi": "NCT of Delhi",
    "newdelhi": "NCT of Delhi",
    "uttaranchal": "Uttarakhand"
  };

export const DISTRICT_ALIASES: Record<string, Record<string, string>> = {
    "Tamil Nadu": {
      "trichy": "Thiruchirappalli",
      "tiruchirapalli": "Thiruchirappalli",
      "nilgiris": "The Nilgiris",
      "ooty": "The Nilgiris",
      "kanyakumari": "Nagercoil (Kannyiakumari)"
    }
  };

export const AGMARKNET_RESOURCE = "9ef84268-d588-465a-a308-a864a43d0070";
export const AGMARKNET_URL = `https://api.data.gov.in/resource/${AGMARKNET_RESOURCE}`;

const SOURCE = "agmarknet-data.gov.in";

/**
 * Indic transliteration varies almost entirely in vowels and aspirates,
 * so the consonant skeleton is the stable part: lowercase, letters only,
 * drop "h", drop vowels, collapse doubled consonants. "Thiruvallur" and
 * "Thiruvellore" both reduce to "trvlr".
 *
 * Validated across all 284 districts with zero collisions.
 */
function skeleton(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .replace(/h/g, "")
    .replace(/[aeiou]/g, "")
    .replace(/(.)\1+/g, "$1");
}

function plain(value: unknown): string {
  return String(value ?? "").toLowerCase().replace(/[^a-z]/g, "");
}

/**
 * The single matching canonical name, or null when zero or more than one
 * match. This is exact resolution of one place under a different
 * spelling, not fuzzy matching — guessing between two real districts is
 * exactly what must not happen, so an ambiguous skeleton resolves to
 * nothing and the caller gets "unavailable".
 */
function resolveOne(
  input: string,
  candidates: string[],
  aliases?: Record<string, string>
): string | null {
  const raw = plain(input);
  if (!raw) return null;
  if (aliases && aliases[raw]) return aliases[raw];
  const exact = candidates.find((c) => plain(c) === raw);
  if (exact) return exact;
  const key = skeleton(input);
  if (!key) return null;
  const hits = candidates.filter((c) => skeleton(c) === key);
  return hits.length === 1 ? hits[0] : null;
}

/**
 * Deliberately one flat shape rather than a discriminated union.
 *
 * The Vercel function that consumes this is type-checked without
 * strictNullChecks, where union narrowing does not apply — a union here
 * type-errors at build time on the very fields it exists to protect.
 * Every field is therefore always present, and `resolved` is checked
 * explicitly by callers.
 */
export interface Resolution {
  resolved: boolean;
  /** AGMARKNET's own spelling; empty when unresolved. */
  state: string;
  district: string;
  commodity: string;
  reasonKey: "state" | "district" | "commodity" | null;
  reason: string | null;
}

/**
 * Maps the farmer's own free-text state/district onto AGMARKNET's exact
 * spellings. The farmer's record is never rewritten — this only decides
 * what to ask the API for.
 *
 * The failure message names exactly what was searched for, so a farmer
 * can see the mismatch and correct their farm record. Substituting a
 * nearby district would mean showing another market's prices as if they
 * were theirs.
 */
export function resolveLocation(
  askedState: unknown,
  askedDistrict: unknown,
  askedCommodity: unknown
): Resolution {
  const stateText = String(askedState ?? "").trim();
  const districtText = String(askedDistrict ?? "").trim();
  const commodity = String(askedCommodity ?? "").trim();

  const state = resolveOne(stateText, Object.keys(DISTRICT_MAP), STATE_ALIASES);
  if (!state) {
    return {
      resolved: false, state: "", district: "", commodity,
      reasonKey: "state",
      reason: `No market data source matches the state "${stateText || "(not set)"}" on this farm. Check the state on the farm record.`
    };
  }

  const district = resolveOne(districtText, DISTRICT_MAP[state], DISTRICT_ALIASES[state]);
  if (!district) {
    return {
      resolved: false, state, district: "", commodity,
      reasonKey: "district",
      reason: `No market district matching "${districtText || "(not set)"}" was found in ${state}. Check the district on the farm record.`
    };
  }

  if (!commodity) {
    return {
      resolved: false, state, district, commodity: "",
      reasonKey: "commodity",
      reason: "No crop was selected, so there is nothing to look up."
    };
  }

  return { resolved: true, state, district, commodity, reasonKey: null, reason: null };
}

/** The exact query the workflow sent, minus the key the caller adds. */
export function agmarknetQuery(r: {
  state: string;
  district: string;
  commodity: string;
}): URLSearchParams {
  return new URLSearchParams({
    format: "json",
    limit: "100",
    "filters[state]": r.state,
    "filters[district]": r.district,
    "filters[commodity]": r.commodity
  });
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  // The API has been seen to return numbers; tolerate numeric strings
  // without inventing a value for anything genuinely absent.
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function text(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

/** "DD/MM/YYYY" -> "YYYY-MM-DD", or null if it isn't that shape. */
export function toIsoDate(v: unknown): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(v ?? "").trim());
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const day = Number(dd);
  const month = Number(mm);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Maps the AGMARKNET response into the MarketSnapshot contract.
 *
 * Verified response shape (resource 9ef84268-…):
 *   { state, district, market, commodity, variety, grade,
 *     arrival_date: "DD/MM/YYYY", min_price, max_price, modal_price }
 *
 * Every price passes through exactly as reported; a field the source
 * omitted becomes null, never 0 — a zero-rupee price would read as
 * "free", which is worse than "not reported".
 *
 * This resource is a DAILY SNAPSHOT: every row carries the same arrival
 * date, and there is no history to page through. That is why the UI
 * shows a current snapshot and no trend charts.
 */
export function mapAgmarknet(
  body: unknown,
  resolved: { state: string; district: string; commodity: string },
  now: () => Date = () => new Date()
): DataResult<MarketSnapshot> {
  const parsed = typeof body === "string" ? safeParse(body) : body;
  const records =
    typeof parsed === "object" && parsed !== null && Array.isArray((parsed as { records?: unknown }).records)
      ? ((parsed as { records: unknown[] }).records)
      : [];

  const nothingReported: DataResult<MarketSnapshot> = {
    status: "unavailable",
    reason: `No market data was reported today for ${resolved.commodity} in ${resolved.district}.`
  };

  // A 200 with an empty records array is how this API reports "nothing
  // matched" — the HTTP status is still ok, so the count is checked.
  if (records.length === 0) return nothingReported;

  const quotes: MarketPriceQuote[] = [];
  for (const r of records) {
    if (!r || typeof r !== "object") continue;
    const row = r as Record<string, unknown>;
    const market = text(row.market);
    // A quote with no market name cannot be shown or told apart from the
    // others, so it is dropped rather than rendered as a blank row.
    if (!market) continue;
    quotes.push({
      market,
      variety: text(row.variety),
      grade: text(row.grade),
      minPrice: num(row.min_price),
      maxPrice: num(row.max_price),
      modalPrice: num(row.modal_price),
      reportedOn: toIsoDate(row.arrival_date)
    });
  }

  if (quotes.length === 0) return nothingReported;

  // Newest first. Rows without a parseable date sort last rather than
  // being dropped — the price is still real, only its date is unreadable.
  quotes.sort((a, b) => {
    if (a.reportedOn === b.reportedOn) return 0;
    if (a.reportedOn === null) return 1;
    if (b.reportedOn === null) return -1;
    return a.reportedOn < b.reportedOn ? 1 : -1;
  });

  const dates = quotes.map((q) => q.reportedOn).filter((d): d is string => d !== null);

  return {
    status: "ok",
    asOf: now().toISOString(),
    source: SOURCE,
    data: {
      commodity: resolved.commodity,
      state: resolved.state,
      district: resolved.district,
      latestReportedOn: dates.length > 0 ? dates[0] : null,
      priceUnit: "INR_PER_QUINTAL",
      quotes
    }
  };
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}
