import { accentFor } from "@/app/theme";

/**
 * Drawn icons for the five modules that have no supplied artwork:
 * My Farms, Pest Activity, Marketplace, Reports and Scan History.
 *
 * They are authored here rather than pulled from an icon set so they can
 * share the language of the 3D artwork beside them — a glass disc, a
 * soft inner light, a gradient fill and one clear silhouette. No emoji
 * and no borrowed picture: an icon lifted from another module would
 * quietly mislabel the card.
 *
 * These are illustrations, not data. They are marked aria-hidden and
 * every card states its own name in text.
 */

export function ModuleIcon({ id, className = "" }: { id: string; className?: string }) {
  const accent = accentFor(id);
  const [from, to] = accent.gradient;
  const gid = `mi-${id}`;

  return (
    <svg
      viewBox="0 0 96 96"
      className={className}
      role="presentation"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={`${gid}-fill`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={from} />
          <stop offset="100%" stopColor={to} />
        </linearGradient>
        <linearGradient id={`${gid}-glass`} x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="55%" stopColor="#ffffff" stopOpacity="0.45" />
          <stop offset="100%" stopColor={to} stopOpacity="0.28" />
        </linearGradient>
        <radialGradient id={`${gid}-glow`} cx="0.5" cy="0.38" r="0.62">
          <stop offset="0%" stopColor={to} stopOpacity="0.5" />
          <stop offset="100%" stopColor={to} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* The glass disc every one of these shares. */}
      <circle cx="48" cy="48" r="42" fill={`url(#${gid}-glow)`} />
      <circle cx="48" cy="48" r="36" fill={`url(#${gid}-glass)`} stroke={to} strokeOpacity="0.35" strokeWidth="1.2" />
      <ellipse cx="38" cy="33" rx="16" ry="9" fill="#ffffff" opacity="0.5" />

      <g fill={`url(#${gid}-fill)`} stroke={from} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
        <Glyph id={id} />
      </g>
    </svg>
  );
}

function Glyph({ id }: { id: string }) {
  switch (id) {
    // A farmstead above worked rows.
    case "farms":
      return (
        <>
          <path d="M31 46 48 34l17 12v3H31z" />
          <path d="M36 49v10h24V49" fill="none" />
          <path d="M30 63h36M27 68h42M31 73h34" fill="none" strokeOpacity="0.75" />
        </>
      );

    // A leaf with a small insect on it.
    case "pest":
      return (
        <>
          <path d="M32 62c0-14 10-25 27-26 1 15-9 26-27 26Z" />
          <path d="M34 64 56 42" fill="none" strokeOpacity="0.7" />
          <ellipse cx="57" cy="60" rx="6" ry="7.5" />
          <path d="M57 53v-4M53 55l-4-3M61 55l4-3M51 61h-4M67 61h-4" fill="none" strokeOpacity="0.85" />
        </>
      );

    // A harvest basket with a rising line behind it.
    case "marketplace":
      return (
        <>
          <path d="M28 52h40l-5 18a3 3 0 0 1-3 2H36a3 3 0 0 1-3-2Z" />
          <path d="M38 52c0-7 4-11 10-11s10 4 10 11" fill="none" />
          <path d="M34 30l7 7 6-6 8 9" fill="none" strokeOpacity="0.8" />
          <circle cx="63" cy="41" r="2.4" />
        </>
      );

    // A sheet of paper with a bar chart on it.
    case "reports":
      return (
        <>
          <path d="M34 26h20l10 10v34a3 3 0 0 1-3 3H34a3 3 0 0 1-3-3V29a3 3 0 0 1 3-3Z" />
          <path d="M54 26v10h10" fill="none" strokeOpacity="0.8" />
          <path d="M40 62V52M48 62V45M56 62V56" fill="none" strokeWidth="3" strokeOpacity="0.9" />
        </>
      );

    // Stacked scan frames, the older ones behind.
    case "scanHistory":
      return (
        <>
          <rect x="27" y="24" width="34" height="34" rx="5" opacity="0.4" />
          <rect x="34" y="33" width="34" height="34" rx="5" opacity="0.65" />
          <rect x="30" y="42" width="34" height="28" rx="5" />
          <path d="M36 48v-2a2 2 0 0 1 2-2h3M58 48v-2a2 2 0 0 0-2-2h-3M36 64v2a2 2 0 0 0 2 2h3M58 64v2a2 2 0 0 1-2 2h-3" fill="none" strokeOpacity="0.9" />
          <path d="M34 56h26" fill="none" strokeOpacity="0.8" />
        </>
      );

    default:
      return <circle cx="48" cy="48" r="14" />;
  }
}
