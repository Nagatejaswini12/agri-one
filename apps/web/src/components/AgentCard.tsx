import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { AgentTile } from "@/app/agents";
import { accentFor } from "@/app/theme";
import { ModuleIcon } from "@/components/ModuleIcon";

/**
 * Artwork first, then a name, then one short line.
 *
 * The picture is the card rather than a bullet beside it: about 112px on
 * a desktop tile, 96 on a tablet, 80 on a phone. A farmer scanning the
 * home screen is choosing a destination, not reading a report, so there
 * is nothing else on it.
 *
 * The accent tints the card around the artwork — a wash behind it and a
 * hairline edge — and never the artwork itself, which arrives already
 * coloured. Nothing here carries information: no number, status or
 * availability is conveyed by colour or picture, so a card cannot imply
 * something the page behind it has not fetched.
 */
export function AgentCard({ tile, compact = false }: { tile: AgentTile; compact?: boolean }) {
  const { t } = useTranslation();
  const accent = accentFor(tile.id);
  const name = t(tile.labelKey);

  const artBox = compact
    ? "h-16 w-16 sm:h-[4.5rem] sm:w-[4.5rem]"
    : "h-20 w-20 sm:h-24 sm:w-24 lg:h-28 lg:w-28";

  return (
    <Link
      to={tile.to}
      aria-label={t("dashboard.openModule", { name })}
      className={`agri-card-interactive group relative flex min-w-0 items-center gap-3 overflow-hidden p-4 ring-1 sm:gap-4 ${accent.ring} ${
        compact ? "sm:p-4" : "sm:p-5"
      }`}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${accent.wash}`}
      />

      <span className={`relative flex shrink-0 items-center justify-center ${artBox}`}>
        {tile.art ? (
          <img
            src={tile.art}
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
            width={320}
            height={320}
            className="h-full w-full object-contain drop-shadow-sm transition duration-200 group-hover:scale-[1.05] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
        ) : (
          <ModuleIcon
            id={tile.id}
            className="h-full w-full drop-shadow-sm transition duration-200 group-hover:scale-[1.05] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
        )}
      </span>

      {/* Titles wrap rather than truncate. A centred one-line title that
          overruns its card is clipped at BOTH ends, which turned
          "வானிலை & ஆலோசனை" into "ானிலை & ஆலோசனை" — and Tamil, Telugu and
          Hindi labels are routinely longer than the English these were
          laid out against. */}
      <span className="relative flex min-w-0 flex-col">
        <span
          className={`line-clamp-2 font-semibold text-agri-forest ${
            compact ? "text-sm" : "text-sm sm:text-base lg:text-lg"
          }`}
        >
          {name}
        </span>
        {/* Three lines from `lg`, where the artwork is at its largest and
            leaves the text the least room. Two lines held the English
            blurbs but cut the Tamil ones mid-sentence. */}
        <span className="mt-0.5 line-clamp-2 text-xs text-gray-600 sm:text-sm lg:line-clamp-3">
          {t(tile.descKey)}
        </span>
      </span>
    </Link>
  );
}
