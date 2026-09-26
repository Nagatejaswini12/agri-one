/**
 * The modules as the farmer meets them.
 *
 * One list, read by the dashboard, the stage hubs and the navigation, so
 * they cannot drift apart about what exists or what it is called.
 *
 * `art` points at supplied artwork; where there is none the card draws
 * its own icon from ModuleIcon under the same id. Either way the card
 * looks finished — nothing renders as a placeholder.
 *
 * This is presentation only. Every `to` is an existing route and nothing
 * here changes what a module does.
 */

export type Stage = "plan" | "grow" | "protect" | "sell";

export interface AgentTile {
  /** Stable id: also the accent key and the drawn-icon key. */
  id: string;
  to: string;
  /** Existing nav label key — no new names for existing routes. */
  labelKey: string;
  /** One short line. Never a status, never a number. */
  descKey: string;
  art: string | null;
  stage: Stage;
}

/** The six agents that reason over live data. Large cards. */
export const AGENT_TILES: AgentTile[] = [
  {
    id: "weather",
    to: "/weather",
    labelKey: "nav.weather",
    descKey: "agent.weather",
    art: "/agents/weather.webp",
    stage: "grow"
  },
  {
    id: "diagnosis",
    to: "/scan-crop",
    labelKey: "nav.scanCrop",
    descKey: "agent.diagnosis",
    art: "/agents/diagnosis.webp",
    stage: "grow"
  },
  {
    id: "soil",
    to: "/soil-water",
    labelKey: "nav.soilWater",
    descKey: "agent.soil",
    art: "/agents/soil.webp",
    stage: "plan"
  },
  {
    id: "market",
    to: "/market",
    labelKey: "nav.market",
    descKey: "agent.market",
    art: "/agents/market.webp",
    stage: "sell"
  },
  {
    id: "schemes",
    to: "/schemes",
    labelKey: "nav.schemes",
    descKey: "agent.schemes",
    art: "/agents/schemes.webp",
    stage: "protect"
  },
  {
    id: "voice",
    to: "/voice-ai",
    labelKey: "nav.voiceAi",
    descKey: "agent.voice",
    art: "/agents/voice.webp",
    stage: "grow"
  }
];

/** Supporting tools: the farmer's own records. Smaller cards. */
export const TOOL_TILES: AgentTile[] = [
  {
    id: "farms",
    to: "/farms",
    labelKey: "nav.farms",
    descKey: "agent.farms",
    art: null,
    stage: "plan"
  },
  {
    id: "reports",
    to: "/reports",
    labelKey: "nav.reports",
    descKey: "agent.reports",
    art: null,
    stage: "sell"
  },
  {
    id: "scanHistory",
    to: "/scan-history",
    labelKey: "nav.scanHistory",
    descKey: "agent.scanHistory",
    art: null,
    stage: "grow"
  },
  {
    id: "pest",
    to: "/pest-alerts",
    labelKey: "nav.pestAlerts",
    descKey: "agent.pest",
    art: null,
    stage: "protect"
  },
  {
    id: "marketplace",
    to: "/marketplace",
    labelKey: "nav.marketplace",
    descKey: "agent.marketplace",
    art: null,
    stage: "sell"
  }
];

export const ALL_TILES = [...AGENT_TILES, ...TOOL_TILES];

export const STAGES: { stage: Stage; titleKey: string; descriptionKey: string }[] = [
  { stage: "plan", titleKey: "stages.plan.title", descriptionKey: "stages.plan.description" },
  { stage: "grow", titleKey: "stages.grow.title", descriptionKey: "stages.grow.description" },
  { stage: "protect", titleKey: "stages.protect.title", descriptionKey: "stages.protect.description" },
  { stage: "sell", titleKey: "stages.sell.title", descriptionKey: "stages.sell.description" }
];

/**
 * The two modules each stage covers, in the order the journey names
 * them: PLAN is the farm and its soil, GROW is weather and crop health,
 * PROTECT is pests and the schemes that help, SELL is price then place.
 */
const STAGE_MEMBERS: Record<Stage, string[]> = {
  plan: ["farms", "soil"],
  grow: ["weather", "diagnosis"],
  protect: ["pest", "schemes"],
  sell: ["market", "marketplace"]
};

export function tilesForStage(stage: Stage): AgentTile[] {
  return STAGE_MEMBERS[stage]
    .map((id) => ALL_TILES.find((t) => t.id === id))
    .filter((t): t is AgentTile => t !== undefined);
}
