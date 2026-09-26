/**
 * One accent per module, chosen by meaning rather than decoration.
 *
 * Every value is a complete Tailwind class string. They are written out
 * in full on purpose — class names assembled at runtime are invisible to
 * Tailwind's scanner and get stripped from the build, which is how a
 * palette like this usually breaks.
 *
 * On a dark ground the accents do less work than they did on paper. A
 * card is not tinted; it is dark glass with a coloured edge, a faint
 * glow behind its artwork and a coloured label. Anything heavier and
 * eleven modules become eleven competing screens.
 *
 * The artwork itself is never recoloured. These light the space around it.
 */

export interface Accent {
  /** Very low-opacity wash inside the card, behind the artwork. */
  wash: string;
  /** Hairline edge picking up the accent. */
  ring: string;
  /** Small label chip. */
  chip: string;
  /** Text in the accent colour — section labels, links. */
  text: string;
  /** Tint for a stage or section header. */
  section: string;
  /** Radial halo placed behind artwork. */
  glow: string;
  /** Stroke/fill for the drawn icons. */
  stroke: string;
  /** Gradient stops for the drawn icons. */
  gradient: [string, string];
}

const ACCENTS: Record<string, Accent> = {
  // My Farms → Emerald
  farms: {
    wash: "from-agri-emerald/12 via-agri-emerald/4 to-transparent",
    ring: "ring-agri-emerald/25",
    chip: "bg-agri-emerald/15 text-agri-emerald",
    text: "text-agri-emerald",
    section: "from-agri-emerald/15 to-transparent",
    glow: "bg-agri-emerald/20",
    stroke: "text-agri-emerald",
    gradient: ["#34D399", "#A7F3D0"]
  },
  // Weather → Cyan / Sky
  weather: {
    wash: "from-agri-cyan/12 via-agri-cyan/4 to-transparent",
    ring: "ring-agri-cyan/25",
    chip: "bg-agri-cyan/15 text-agri-cyan",
    text: "text-agri-cyan",
    section: "from-agri-cyan/15 to-transparent",
    glow: "bg-agri-cyan/20",
    stroke: "text-agri-cyan",
    gradient: ["#38BDF8", "#BAE6FD"]
  },
  // Soil → Leaf green
  soil: {
    wash: "from-agri-leaf/12 via-agri-leaf/4 to-transparent",
    ring: "ring-agri-leaf/25",
    chip: "bg-agri-leaf/15 text-agri-leaf",
    text: "text-agri-leaf",
    section: "from-agri-leaf/15 to-transparent",
    glow: "bg-agri-leaf/20",
    stroke: "text-agri-leaf",
    gradient: ["#6EE05B", "#D1FAC4"]
  },
  // Crop Diagnosis → Violet
  diagnosis: {
    wash: "from-agri-violet/12 via-agri-violet/4 to-transparent",
    ring: "ring-agri-violet/25",
    chip: "bg-agri-violet/15 text-agri-violet",
    text: "text-agri-violet",
    section: "from-agri-violet/15 to-transparent",
    glow: "bg-agri-violet/20",
    stroke: "text-agri-violet",
    gradient: ["#A78BFA", "#DDD6FE"]
  },
  // Pest Activity → Coral
  pest: {
    wash: "from-agri-coral/12 via-agri-coral/4 to-transparent",
    ring: "ring-agri-coral/25",
    chip: "bg-agri-coral/15 text-agri-coral",
    text: "text-agri-coral",
    section: "from-agri-coral/15 to-transparent",
    glow: "bg-agri-coral/20",
    stroke: "text-agri-coral",
    gradient: ["#FB7B67", "#FECACA"]
  },
  // Market Analysis → Amber
  market: {
    wash: "from-agri-amber/12 via-agri-amber/4 to-transparent",
    ring: "ring-agri-amber/25",
    chip: "bg-agri-amber/15 text-agri-amber",
    text: "text-agri-amber",
    section: "from-agri-amber/15 to-transparent",
    glow: "bg-agri-amber/20",
    stroke: "text-agri-amber",
    gradient: ["#FBBF3C", "#FDE68A"]
  },
  // Marketplace → Orange
  marketplace: {
    wash: "from-agri-orange/12 via-agri-orange/4 to-transparent",
    ring: "ring-agri-orange/25",
    chip: "bg-agri-orange/15 text-agri-orange",
    text: "text-agri-orange",
    section: "from-agri-orange/15 to-transparent",
    glow: "bg-agri-orange/20",
    stroke: "text-agri-orange",
    gradient: ["#FB923C", "#FED7AA"]
  },
  // Government Schemes → Blue
  schemes: {
    wash: "from-agri-blue/12 via-agri-blue/4 to-transparent",
    ring: "ring-agri-blue/25",
    chip: "bg-agri-blue/15 text-agri-blue",
    text: "text-agri-blue",
    section: "from-agri-blue/15 to-transparent",
    glow: "bg-agri-blue/20",
    stroke: "text-agri-blue",
    gradient: ["#60A5FA", "#BFDBFE"]
  },
  // Reports → Purple
  reports: {
    wash: "from-agri-purple/12 via-agri-purple/4 to-transparent",
    ring: "ring-agri-purple/25",
    chip: "bg-agri-purple/15 text-agri-purple",
    text: "text-agri-purple",
    section: "from-agri-purple/15 to-transparent",
    glow: "bg-agri-purple/20",
    stroke: "text-agri-purple",
    gradient: ["#C084FC", "#E9D5FF"]
  },
  // Scan History → Teal
  scanHistory: {
    wash: "from-agri-teal/12 via-agri-teal/4 to-transparent",
    ring: "ring-agri-teal/25",
    chip: "bg-agri-teal/15 text-agri-teal",
    text: "text-agri-teal",
    section: "from-agri-teal/15 to-transparent",
    glow: "bg-agri-teal/20",
    stroke: "text-agri-teal",
    gradient: ["#2DD4BF", "#99F6E4"]
  },
  // Voice AI → Pink / violet
  voice: {
    wash: "from-agri-pink/12 via-agri-violet/4 to-transparent",
    ring: "ring-agri-pink/25",
    chip: "bg-agri-pink/15 text-agri-pink",
    text: "text-agri-pink",
    section: "from-agri-pink/15 to-transparent",
    glow: "bg-agri-pink/20",
    stroke: "text-agri-pink",
    gradient: ["#F472B6", "#FBCFE8"]
  },
  // Orchestrator → multi-colour. It is the one thing that reads across
  // every other module, so it is the one card allowed more than one hue.
  orchestrator: {
    wash: "from-agri-emerald/14 via-agri-cyan/6 to-agri-violet/10",
    ring: "ring-agri-emerald/30",
    chip: "bg-agri-emerald/15 text-agri-emerald",
    text: "text-agri-emerald",
    section: "from-agri-emerald/15 to-transparent",
    glow: "bg-agri-emerald/20",
    stroke: "text-agri-emerald",
    gradient: ["#34D399", "#A78BFA"]
  }
};

const FALLBACK = ACCENTS.farms;

export function accentFor(id: string): Accent {
  return ACCENTS[id] ?? FALLBACK;
}

/** Stage tints, so the journey reads as four distinct steps. */
export const STAGE_ACCENT: Record<string, { header: string; dot: string; text: string }> = {
  plan: { header: "from-agri-emerald/15 to-transparent", dot: "bg-agri-emerald", text: "text-agri-emerald" },
  grow: { header: "from-agri-leaf/15 to-transparent", dot: "bg-agri-leaf", text: "text-agri-leaf" },
  protect: { header: "from-agri-blue/15 to-transparent", dot: "bg-agri-blue", text: "text-agri-blue" },
  sell: { header: "from-agri-amber/15 to-transparent", dot: "bg-agri-amber", text: "text-agri-amber" }
};
