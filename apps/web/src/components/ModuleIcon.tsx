import { accentFor } from "@/app/theme";

/**
 * A drawn icon for every module.
 *
 * Five of these carry cards on their own — My Farms, Pest Activity,
 * Marketplace, Reports and Scan History have no supplied artwork. The
 * other seven exist so the cinematic hero has a small mark to sit beside
 * a page title without falling back to a bare circle, which is what a
 * missing case looks like and reads as unfinished.
 *
 * They are authored here rather than pulled from an icon set so they can
 * share the language of the 3D artwork beside them: a glass disc lit
 * from within, a gradient fill and one clear silhouette. No emoji and no
 * borrowed picture — an icon lifted from another module would quietly
 * mislabel the card.
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
          <stop offset="0%" stopColor={to} />
          <stop offset="100%" stopColor={from} />
        </linearGradient>
        {/* The disc reads as dark glass now, not frosted white: a deep
            well tinted by the accent, with the light coming from the
            accent's own edge rather than from a white highlight. */}
        <linearGradient id={`${gid}-glass`} x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0%" stopColor={to} stopOpacity="0.22" />
          <stop offset="60%" stopColor="#07130F" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#07130F" stopOpacity="0.75" />
        </linearGradient>
        <radialGradient id={`${gid}-glow`} cx="0.5" cy="0.4" r="0.6">
          <stop offset="0%" stopColor={to} stopOpacity="0.45" />
          <stop offset="100%" stopColor={to} stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle cx="48" cy="48" r="44" fill={`url(#${gid}-glow)`} />
      <circle
        cx="48"
        cy="48"
        r="36"
        fill={`url(#${gid}-glass)`}
        stroke={to}
        strokeOpacity="0.45"
        strokeWidth="1.4"
      />
      {/* A single light catch along the upper edge. */}
      <path
        d="M20 40a29 29 0 0 1 52-6"
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.18"
        strokeWidth="1.6"
        strokeLinecap="round"
      />

      <g
        fill={`url(#${gid}-fill)`}
        stroke={to}
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
      >
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

    // A cloud with sun behind and rain below.
    case "weather":
      return (
        <>
          <circle cx="60" cy="38" r="9" opacity="0.75" />
          <path d="M34 58a10 10 0 0 1 1-20 14 14 0 0 1 26-3 9 9 0 0 1 0 23Z" />
          <path d="M37 66l-3 7M48 66l-3 7M59 66l-3 7" fill="none" strokeOpacity="0.85" strokeWidth="2.6" />
        </>
      );

    // A seedling rooted in a band of earth.
    case "soil":
      return (
        <>
          <path d="M48 52V38" fill="none" strokeWidth="2.6" />
          <path d="M48 42c0-6 5-10 11-10 0 6-5 10-11 10ZM48 46c0-5-4-9-10-9 0 5 4 9 10 9Z" />
          <rect x="26" y="54" width="44" height="18" rx="4" opacity="0.85" />
          <path d="M26 61h44" fill="none" strokeOpacity="0.55" />
          <path d="M40 72v-5M56 72v-7" fill="none" strokeOpacity="0.6" />
        </>
      );

    // A leaf under a magnifier.
    case "diagnosis":
      return (
        <>
          <path d="M30 60c0-13 9-23 25-24 1 14-8 24-25 24Z" opacity="0.85" />
          <circle cx="56" cy="46" r="15" fill="none" strokeWidth="2.6" />
          <path d="M67 57l9 9" fill="none" strokeWidth="3.4" />
        </>
      );

    // A rising bar chart with a trend line.
    case "market":
      return (
        <>
          <rect x="29" y="54" width="9" height="18" rx="2" />
          <rect x="43" y="44" width="9" height="28" rx="2" />
          <rect x="57" y="34" width="9" height="38" rx="2" />
          <path d="M30 46l13-9 12 6 12-15" fill="none" strokeWidth="2.6" strokeOpacity="0.9" />
        </>
      );

    // A document bearing an official seal.
    case "schemes":
      return (
        <>
          <path d="M32 24h32a3 3 0 0 1 3 3v42a3 3 0 0 1-3 3H32a3 3 0 0 1-3-3V27a3 3 0 0 1 3-3Z" opacity="0.9" />
          <path d="M37 36h22M37 44h22M37 52h12" fill="none" strokeOpacity="0.6" strokeWidth="2.4" />
          <circle cx="60" cy="60" r="10" />
          <path d="M56 70l4-3 4 3v6l-4-3-4 3z" />
        </>
      );

    // A microphone against a waveform.
    case "voice":
      return (
        <>
          <rect x="41" y="24" width="14" height="28" rx="7" />
          <path d="M34 45a14 14 0 0 0 28 0" fill="none" strokeWidth="2.6" />
          <path d="M48 59v9" fill="none" strokeWidth="2.6" />
          <path d="M26 38v12M32 34v20M64 34v20M70 38v12" fill="none" strokeWidth="2.4" strokeOpacity="0.7" />
        </>
      );

    // A hub reading from four sources at once.
    case "orchestrator":
      return (
        <>
          <path d="M48 26v14M48 56v14M26 48h14M56 48h14" fill="none" strokeWidth="2.4" strokeOpacity="0.7" />
          <circle cx="48" cy="24" r="5" opacity="0.85" />
          <circle cx="48" cy="72" r="5" opacity="0.85" />
          <circle cx="24" cy="48" r="5" opacity="0.85" />
          <circle cx="72" cy="48" r="5" opacity="0.85" />
          <circle cx="48" cy="48" r="12" />
          <path d="M48 54c0-5 3-9 8-9 0 5-3 9-8 9Z" fill="none" strokeOpacity="0.9" />
        </>
      );

    default:
      return <circle cx="48" cy="48" r="14" />;
  }
}
