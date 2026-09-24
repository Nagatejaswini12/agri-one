/**
 * Curated directory of official pest-related resources.
 *
 * AGRI ONE holds no pest knowledge base of its own. What it can honestly
 * do is report what the farmer's own crop scans found, and then point at
 * the bodies that are actually responsible for plant protection in
 * India. Every entry here is a place a person can go; none of it is
 * advice this app is giving.
 *
 * RULES FOR EDITING THIS LIST — the same discipline as the curated
 * scheme catalog (`services/n8n/workflows/src/schemes/catalog-literal.js`):
 *
 *  1. Never add an entry without opening the URL and reading the page.
 *     `lastVerifiedOn` means a person did that on that date. Do not bump
 *     the date without re-reading.
 *  2. `sourceUrl` must be an official government or ICAR address, https,
 *     and must load.
 *  3. `purpose` describes what a farmer will FIND there. It must never
 *     state or imply a treatment, and must never name a chemical,
 *     product or dose — AGRI ONE does not give treatment advice, and a
 *     description here is still AGRI ONE speaking.
 *  4. Link to a portal or section home, never deep-link into a page of
 *     chemical recommendations. Where an official body publishes such
 *     guidance, the farmer reaches it on that body's own site, under
 *     that body's own name — which is exactly where that decision
 *     belongs.
 *  5. National entries (`states: []`) are allowed here, unlike the
 *     Marketplace selling channels: a national plant-protection
 *     authority genuinely serves every state, whereas a state's market
 *     does not. A state-specific entry still shows only in its state.
 */
export interface OfficialPestResource {
  id: string;
  /** Empty = national, shown for every state. Otherwise official state spellings. */
  states: string[];
  name: string;
  /** What the farmer will find there. Never a treatment claim. */
  purpose: string;
  sourceName: string;
  sourceUrl: string;
  /** YYYY-MM-DD a person last opened this URL and confirmed it. */
  lastVerifiedOn: string;
}

export const OFFICIAL_PEST_RESOURCES: OfficialPestResource[] = [
  {
    id: "npss",
    states: [],
    name: "National Pest Surveillance System (NPSS)",
    purpose:
      "The government's own pest surveillance platform, where a farmer can report a pest sighting and look up pests and diseases recorded in Indian crops.",
    sourceName:
      "National Pest Surveillance System, Department of Agriculture and Farmers Welfare, Government of India",
    sourceUrl: "https://npss.dac.gov.in/",
    lastVerifiedOn: "2026-09-24"
  },
  {
    id: "ppqs",
    states: [],
    name: "Directorate of Plant Protection, Quarantine & Storage",
    purpose:
      "The central authority for plant protection in India. Its farmer corner carries official crop protection material and pest identification guidance.",
    sourceName:
      "Directorate of Plant Protection, Quarantine & Storage, Ministry of Agriculture & Farmers Welfare",
    sourceUrl: "https://ppqs.gov.in/",
    lastVerifiedOn: "2026-09-24"
  },
  {
    id: "tn-agrisnet",
    states: ["Tamil Nadu"],
    name: "Tamil Nadu Agrisnet — Pest and Disease Details",
    purpose:
      "The state agriculture department's farmer corner, with pest and disease information for crops grown in Tamil Nadu, and the district offices to contact.",
    sourceName: "Department of Agriculture - Farmers Welfare, Government of Tamil Nadu",
    sourceUrl: "https://www.tnagrisnet.tn.gov.in/",
    lastVerifiedOn: "2026-09-24"
  }
];

/**
 * National resources always apply. A state resource applies only to its
 * own state, matched case-insensitively on the farm's saved state so a
 * spelling variant cannot silently drop a real resource.
 */
export function resourcesForState(state: string | null | undefined): OfficialPestResource[] {
  const key = typeof state === "string" ? state.trim().toLowerCase() : "";
  return OFFICIAL_PEST_RESOURCES.filter(
    (r) => r.states.length === 0 || (key !== "" && r.states.some((s) => s.toLowerCase() === key))
  );
}
