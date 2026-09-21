// ---------------------------------------------------------------------
// CURATED SCHEME CATALOG — HUMAN-MAINTAINED, NOT LIVE DATA.
//
// There is no public API for Indian government scheme eligibility.
// myScheme's own endpoint (api.myscheme.gov.in/search/v4/schemes) returns
// 401 to anyone outside its portal, and data.gov.in publishes scheme
// budget/beneficiary tables, not eligibility rules. So this catalog is
// curated by hand from official sources and every entry carries the
// source it came from plus the date a human last checked it.
//
// RULES FOR EDITING THIS CATALOG:
//  1. Never invent a scheme, a benefit, or an amount. If a figure is not
//     stated on the official source, describe the benefit qualitatively
//     and let the farmer read the source.
//  2. sourceUrl must be an official government URL, and must be live.
//     The "Schemes Catalog Check" workflow tests these on a schedule.
//  3. Update lastVerifiedOn (YYYY-MM-DD) whenever you re-read the source
//     and confirm the entry still matches it. Do not bump the date
//     without actually re-reading.
//  4. Never generate entries with an LLM at runtime. The whole point of
//     a curated catalog is that a person vouched for each line.
//  5. Every scheme MUST carry at least one criterion of kind "manual" —
//     something only the farmer or the issuing office can confirm. This
//     is what makes a bare "you are eligible" result unconstructible.
//
// Criterion kinds evaluated by "Evaluate Criteria":
//   farm_record          always matched (a farm was selected)
//   land_area_recorded   areaAcres present -> matched, null -> cannot_check
//   max_area_acres       params.acres; null area -> cannot_check
//   state_match          farm's resolved state is in scheme.states
//   crop_recorded        farm has >= 1 crop
//   crop_in              params.crops, case-insensitive
//   manual               always cannot_check
// ---------------------------------------------------------------------

const CATALOG_VERSION = "2026-09-21";

const CATALOG = [
  {
    id: "pm-kisan",
    name: "Pradhan Mantri Kisan Samman Nidhi (PM-KISAN)",
    level: "central",
    states: [],
    purpose: "Income support for landholding farmer families.",
    benefit:
      "Rs 6,000 per year, paid in three equal instalments of Rs 2,000 directly into the beneficiary's bank account.",
    appliesToCrops: [],
    criteria: [
      { key: "landRecorded", kind: "land_area_recorded" },
      { key: "landOwnership", kind: "manual" },
      { key: "notIncomeTaxPayer", kind: "manual" },
      { key: "notGovtOrProfessional", kind: "manual" },
      { key: "bankAadhaar", kind: "manual" }
    ],
    sourceName: "PM-KISAN portal, Department of Agriculture and Farmers Welfare",
    sourceUrl: "https://pmkisan.gov.in/",
    lastVerifiedOn: "2026-09-21"
  },
  {
    id: "pmfby",
    name: "Pradhan Mantri Fasal Bima Yojana (PMFBY)",
    level: "central",
    states: [],
    purpose: "Crop insurance against yield loss from natural risks.",
    benefit:
      "The farmer's share of the premium is capped at 2% of the sum insured for Kharif food and oilseed crops, 1.5% for Rabi, and 5% for commercial and horticultural crops. The balance is subsidised by the Centre and the State.",
    appliesToCrops: [],
    criteria: [
      { key: "cropRecorded", kind: "crop_recorded" },
      { key: "notifiedCropArea", kind: "manual" },
      { key: "enrolmentWindow", kind: "manual" },
      { key: "bankAadhaar", kind: "manual" }
    ],
    sourceName: "PMFBY portal, Department of Agriculture and Farmers Welfare",
    sourceUrl: "https://pmfby.gov.in/",
    lastVerifiedOn: "2026-09-21"
  },
  {
    id: "soil-health-card",
    name: "Soil Health Card Scheme",
    level: "central",
    states: [],
    purpose:
      "Soil testing and a card reporting nutrient status with crop-wise fertiliser recommendations.",
    benefit:
      "Soil sample testing and a Soil Health Card issued to the farmer through the State agriculture department.",
    appliesToCrops: [],
    criteria: [
      { key: "landRecorded", kind: "land_area_recorded" },
      { key: "sampleCycle", kind: "manual" },
      { key: "localRegistration", kind: "manual" }
    ],
    sourceName: "Soil Health Card portal, Department of Agriculture and Farmers Welfare",
    sourceUrl: "https://soilhealth.dac.gov.in/",
    lastVerifiedOn: "2026-09-21"
  },
  {
    id: "kcc",
    name: "Kisan Credit Card (KCC)",
    level: "central",
    states: [],
    purpose: "Short-term credit for cultivation expenses and allied activities.",
    benefit:
      "A revolving credit facility for crop and allied-activity expenses, with interest subvention available on prompt repayment. The credit limit and rate are set by the lending bank under RBI and NABARD norms.",
    appliesToCrops: [],
    criteria: [
      { key: "landRecorded", kind: "land_area_recorded" },
      { key: "landOwnershipOrTenancy", kind: "manual" },
      { key: "bankBranch", kind: "manual" }
    ],
    sourceName: "myScheme, National Portal of India",
    sourceUrl: "https://www.myscheme.gov.in/schemes/kcc",
    lastVerifiedOn: "2026-09-21"
  },
  {
    id: "pm-kusum",
    name: "PM-KUSUM (Kisan Urja Suraksha evam Utthaan Mahabhiyan)",
    level: "central",
    states: [],
    purpose: "Solar pumps and solarisation of agricultural pumps.",
    benefit:
      "Central financial assistance towards standalone solar pumps and the solarisation of existing grid-connected agricultural pumps. Assistance shares are set component-wise by MNRE and the State.",
    appliesToCrops: [],
    criteria: [
      { key: "landRecorded", kind: "land_area_recorded" },
      { key: "existingPump", kind: "manual" },
      { key: "stateComponentOpen", kind: "manual" }
    ],
    sourceName: "PM-KUSUM portal, Ministry of New and Renewable Energy",
    sourceUrl: "https://pmkusum.mnre.gov.in/",
    lastVerifiedOn: "2026-09-21"
  },
  {
    id: "agri-infrastructure-fund",
    name: "Agriculture Infrastructure Fund (AIF)",
    level: "central",
    states: [],
    purpose: "Financing for post-harvest management and community farming assets.",
    benefit:
      "Medium- to long-term debt financing for eligible post-harvest and community farming infrastructure, with interest subvention and credit-guarantee support.",
    appliesToCrops: [],
    criteria: [
      { key: "entityType", kind: "manual" },
      { key: "projectProposal", kind: "manual" },
      { key: "bankBranch", kind: "manual" }
    ],
    sourceName: "Agriculture Infrastructure Fund portal, Department of Agriculture and Farmers Welfare",
    sourceUrl: "https://agriinfra.dac.gov.in/",
    lastVerifiedOn: "2026-09-21"
  },
  {
    id: "tn-uzhavar-sandhai",
    name: "Uzhavar Sandhai (Farmers' Market)",
    level: "state",
    states: ["Tamil Nadu"],
    purpose:
      "Selling space for farmers to sell their produce directly to consumers, without intermediaries.",
    benefit:
      "A designated selling slot in a government-run farmers' market, with prices fixed daily by the Tamil Nadu State Agricultural Marketing Board.",
    appliesToCrops: [],
    criteria: [
      { key: "stateMatch", kind: "state_match" },
      { key: "cropRecorded", kind: "crop_recorded" },
      { key: "localRegistration", kind: "manual" }
    ],
    sourceName:
      "Department of Agricultural Marketing and Agri Business, Government of Tamil Nadu",
    sourceUrl: "https://www.agrimark.tn.gov.in/index.php/Infra/us_details",
    lastVerifiedOn: "2026-09-21"
  },
  {
    id: "tn-aed-individual-subsidy",
    name: "Tamil Nadu Agricultural Engineering Individual-Based Subsidy Schemes",
    level: "state",
    states: ["Tamil Nadu"],
    purpose:
      "Subsidy assistance to individual farmers for farm machinery, irrigation and land development works.",
    benefit:
      "Individual-farmer subsidy on approved equipment and works. Rates and eligible items are notified by the Department of Agricultural Engineering and change by scheme year.",
    appliesToCrops: [],
    criteria: [
      { key: "stateMatch", kind: "state_match" },
      { key: "landRecorded", kind: "land_area_recorded" },
      { key: "itemNotified", kind: "manual" },
      { key: "localRegistration", kind: "manual" }
    ],
    sourceName: "Department of Agricultural Engineering, Government of Tamil Nadu",
    sourceUrl: "https://aed.tn.gov.in/en/individual-based-subsidy-schemes/",
    lastVerifiedOn: "2026-09-21"
  },
  {
    id: "mh-mahadbt-farmer",
    name: "MahaDBT Farmer Schemes (Maharashtra)",
    level: "state",
    states: ["Maharashtra"],
    purpose: "Single-window application portal for Maharashtra's farmer subsidy schemes.",
    benefit:
      "Access to the State's farmer subsidy schemes through a single application. Individual scheme benefits and rates are defined per scheme on the portal.",
    appliesToCrops: [],
    criteria: [
      { key: "stateMatch", kind: "state_match" },
      { key: "landRecorded", kind: "land_area_recorded" },
      { key: "localRegistration", kind: "manual" }
    ],
    sourceName: "MahaDBT, Government of Maharashtra",
    sourceUrl: "https://mahadbt.maharashtra.gov.in/Farmer/Login/Login",
    lastVerifiedOn: "2026-09-21"
  },
  {
    id: "ka-raitamitra",
    name: "Raitha Mitra - Karnataka Department of Agriculture Schemes",
    level: "state",
    states: ["Karnataka"],
    purpose: "Karnataka's farmer-facing portal for departmental schemes and services.",
    benefit:
      "Access to Karnataka Department of Agriculture schemes and services. Individual benefits are defined per scheme on the portal.",
    appliesToCrops: [],
    criteria: [
      { key: "stateMatch", kind: "state_match" },
      { key: "landRecorded", kind: "land_area_recorded" },
      { key: "localRegistration", kind: "manual" }
    ],
    sourceName: "Department of Agriculture, Government of Karnataka",
    sourceUrl: "https://raitamitra.karnataka.gov.in/",
    lastVerifiedOn: "2026-09-21"
  }
];
