/**
 * The modules as the farmer meets them, grouped by the PLAN -> GROW ->
 * PROTECT -> SELL journey the app is organised around.
 *
 * This is presentation only: every `to` is an existing route and nothing
 * here changes what a module does. It exists so the dashboard, the stage
 * hubs and the navigation all describe the same set of modules from one
 * place instead of three drifting lists.
 *
 * `art` is null for the four modules that have no custom artwork yet.
 * They deliberately render a plain frosted tile rather than borrowing
 * another module's picture, so it stays obvious which ones are still
 * waiting for their own.
 */

export type Stage = "plan" | "grow" | "protect" | "sell";

export interface AgentTile {
  /** Stable id, also the artwork filename when there is one. */
  id: string;
  to: string;
  /** Existing nav label key — no new names for existing routes. */
  labelKey: string;
  /** One short line. Never a status, never a number. */
  descKey: string;
  art: string | null;
  stage: Stage;
}

export const AGENT_TILES: AgentTile[] = [
  {
    id: "farms",
    to: "/farms",
    labelKey: "nav.farms",
    descKey: "agent.farms",
    art: null,
    stage: "plan"
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
    id: "pest",
    to: "/pest-alerts",
    labelKey: "nav.pestAlerts",
    descKey: "agent.pest",
    art: null,
    stage: "protect"
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
    id: "market",
    to: "/market",
    labelKey: "nav.market",
    descKey: "agent.market",
    art: "/agents/market.webp",
    stage: "sell"
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

/** Reached from anywhere rather than belonging to one stage. */
export const SUPPORT_TILES: AgentTile[] = [
  {
    id: "voice",
    to: "/voice-ai",
    labelKey: "nav.voiceAi",
    descKey: "agent.voice",
    art: "/agents/voice.webp",
    stage: "grow"
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
  }
];

export const STAGES: { stage: Stage; titleKey: string }[] = [
  { stage: "plan", titleKey: "stages.plan.title" },
  { stage: "grow", titleKey: "stages.grow.title" },
  { stage: "protect", titleKey: "stages.protect.title" },
  { stage: "sell", titleKey: "stages.sell.title" }
];

export function tilesForStage(stage: Stage): AgentTile[] {
  return AGENT_TILES.filter((t) => t.stage === stage);
}
