/**
 * Verified official selling channels, by state.
 *
 * These mirror entries in the curated scheme catalog
 * (`services/n8n/workflows/src/schemes/catalog-literal.js`), which is
 * the source of truth — `officialChannels.test.ts` asserts every entry
 * here matches that catalog exactly, so the two cannot drift.
 *
 * The list is deliberately short. A state with no verified channel gets
 * **no section at all**, rather than a national placeholder: pointing a
 * farmer at a generic portal that may not serve their state would be
 * worse than saying nothing.
 *
 * These are official government channels. They are not buyers, and
 * nothing here implies anyone has agreed to purchase anything.
 */
export interface OfficialChannel {
  /** The scheme catalog id this mirrors. */
  catalogId: string;
  /** AGMARKNET/official spelling of the state it applies to. */
  state: string;
  name: string;
  sourceName: string;
  sourceUrl: string;
  /** YYYY-MM-DD a person last checked the entry against its source. */
  lastVerifiedOn: string;
}

export const OFFICIAL_CHANNELS: OfficialChannel[] = [
  {
    catalogId: "tn-uzhavar-sandhai",
    state: "Tamil Nadu",
    name: "Uzhavar Sandhai (Farmers' Market)",
    sourceName:
      "Department of Agricultural Marketing and Agri Business, Government of Tamil Nadu",
    sourceUrl: "https://www.agrimark.tn.gov.in/index.php/Infra/us_details",
    lastVerifiedOn: "2026-09-21"
  }
];

/**
 * Matched on the state AGMARKNET resolved, not on what the farmer
 * typed, so a spelling variant cannot silently miss a real channel.
 */
export function channelsForState(state: string | null | undefined): OfficialChannel[] {
  if (typeof state !== "string" || state.trim() === "") return [];
  const key = state.trim().toLowerCase();
  return OFFICIAL_CHANNELS.filter((c) => c.state.toLowerCase() === key);
}
