/**
 * One accent per module, chosen by meaning rather than decoration:
 * weather is sky, crops are leaf, soil is earth, money is amber,
 * government is teal, the assistant is violet.
 *
 * Every value is a complete Tailwind class string. They are written out
 * in full on purpose — class names assembled at runtime are invisible to
 * Tailwind's scanner and get stripped from the build, which is how a
 * palette like this usually breaks.
 *
 * The artwork itself is never recoloured. These tint the card around it.
 */

export interface Accent {
  /** Soft wash behind the artwork. */
  wash: string;
  /** Hairline edge picking up the accent. */
  ring: string;
  /** Small label chip. */
  chip: string;
  /** Tint for a stage or section header. */
  section: string;
  /** Stroke/fill for the drawn icons. */
  stroke: string;
  /** Gradient stops for the drawn icons. */
  gradient: [string, string];
}

const ACCENTS: Record<string, Accent> = {
  weather: {
    wash: "from-agri-sky/20 via-agri-sky/5 to-transparent",
    ring: "ring-agri-sky/25",
    chip: "bg-agri-sky/12 text-agri-sky",
    section: "from-agri-sky/12 to-transparent",
    stroke: "text-agri-sky",
    gradient: ["#3B93C9", "#8FC9E8"]
  },
  diagnosis: {
    wash: "from-agri-leaf/20 via-agri-leaf/5 to-transparent",
    ring: "ring-agri-leaf/25",
    chip: "bg-agri-leaf/12 text-agri-leaf",
    section: "from-agri-leaf/12 to-transparent",
    stroke: "text-agri-leaf",
    gradient: ["#4D9A3F", "#9BD48C"]
  },
  soil: {
    wash: "from-agri-olive/20 via-agri-olive/5 to-transparent",
    ring: "ring-agri-olive/25",
    chip: "bg-agri-olive/12 text-agri-olive",
    section: "from-agri-olive/12 to-transparent",
    stroke: "text-agri-olive",
    gradient: ["#7C8C43", "#C2CE8A"]
  },
  market: {
    wash: "from-agri-amber/20 via-agri-amber/5 to-transparent",
    ring: "ring-agri-amber/25",
    chip: "bg-agri-amber/12 text-agri-amber",
    section: "from-agri-amber/12 to-transparent",
    stroke: "text-agri-amber",
    gradient: ["#D99A2B", "#F0CE8A"]
  },
  schemes: {
    wash: "from-agri-teal/20 via-agri-teal/5 to-transparent",
    ring: "ring-agri-teal/25",
    chip: "bg-agri-teal/12 text-agri-teal",
    section: "from-agri-teal/12 to-transparent",
    stroke: "text-agri-teal",
    gradient: ["#2E8B84", "#8FCCC7"]
  },
  voice: {
    wash: "from-agri-lavender/20 via-agri-lavender/5 to-transparent",
    ring: "ring-agri-lavender/25",
    chip: "bg-agri-lavender/12 text-agri-lavender",
    section: "from-agri-lavender/12 to-transparent",
    stroke: "text-agri-lavender",
    gradient: ["#8B7BC8", "#C3B8E8"]
  },
  farms: {
    wash: "from-agri-forest/15 via-agri-forest/5 to-transparent",
    ring: "ring-agri-forest/20",
    chip: "bg-agri-forest/10 text-agri-forest",
    section: "from-agri-forest/10 to-transparent",
    stroke: "text-agri-forest",
    gradient: ["#1B4332", "#6E9B84"]
  },
  pest: {
    wash: "from-agri-coral/20 via-agri-coral/5 to-transparent",
    ring: "ring-agri-coral/25",
    chip: "bg-agri-coral/12 text-agri-coral",
    section: "from-agri-coral/12 to-transparent",
    stroke: "text-agri-coral",
    gradient: ["#E0806A", "#F3BCAA"]
  },
  marketplace: {
    wash: "from-agri-amber/16 via-agri-amber/5 to-transparent",
    ring: "ring-agri-amber/20",
    chip: "bg-agri-amber/10 text-agri-amber",
    section: "from-agri-amber/10 to-transparent",
    stroke: "text-agri-amber",
    gradient: ["#C98C2A", "#EAC98F"]
  },
  reports: {
    wash: "from-agri-teal/16 via-agri-teal/5 to-transparent",
    ring: "ring-agri-teal/20",
    chip: "bg-agri-teal/10 text-agri-teal",
    section: "from-agri-teal/10 to-transparent",
    stroke: "text-agri-teal",
    gradient: ["#2E8B84", "#A4D6D1"]
  },
  scanHistory: {
    wash: "from-agri-lavender/16 via-agri-lavender/5 to-transparent",
    ring: "ring-agri-lavender/20",
    chip: "bg-agri-lavender/10 text-agri-lavender",
    section: "from-agri-lavender/10 to-transparent",
    stroke: "text-agri-lavender",
    gradient: ["#7E6FBB", "#CFC6EC"]
  },
  orchestrator: {
    wash: "from-agri-leaf/18 via-agri-teal/8 to-transparent",
    ring: "ring-agri-leaf/25",
    chip: "bg-agri-leaf/12 text-agri-forest",
    section: "from-agri-leaf/12 to-transparent",
    stroke: "text-agri-forest",
    gradient: ["#1B4332", "#4D9A3F"]
  }
};

const FALLBACK = ACCENTS.farms;

export function accentFor(id: string): Accent {
  return ACCENTS[id] ?? FALLBACK;
}

/** Stage tints, so the journey reads as four distinct steps. */
export const STAGE_ACCENT: Record<string, { header: string; dot: string }> = {
  plan: { header: "from-agri-forest/10 to-transparent", dot: "bg-agri-forest" },
  grow: { header: "from-agri-leaf/12 to-transparent", dot: "bg-agri-leaf" },
  protect: { header: "from-agri-teal/12 to-transparent", dot: "bg-agri-teal" },
  sell: { header: "from-agri-amber/12 to-transparent", dot: "bg-agri-amber" }
};
