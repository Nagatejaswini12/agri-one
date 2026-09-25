import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { AgentTile } from "@/app/agents";

/**
 * A module, presented as artwork first.
 *
 * The picture is the card, not a bullet beside the text: ~112px on a
 * desktop tile and ~80px on a phone. Everything else is one label and
 * one short line, because a farmer scanning the home screen is choosing
 * a destination, not reading a report.
 *
 * The artwork never carries information. No number, status or
 * availability is conveyed by it, so a missing picture costs nothing but
 * looks -- which is what lets the four modules without their own art
 * ship on a plain tile instead of borrowing someone else's.
 */
export function AgentCard({ tile }: { tile: AgentTile }) {
  const { t } = useTranslation();
  const name = t(tile.labelKey);

  return (
    <Link
      to={tile.to}
      aria-label={t("dashboard.openModule", { name })}
      className="group relative flex min-w-0 flex-col items-center gap-1 overflow-hidden rounded-2xl border border-white/60 bg-white/70 p-4 text-center shadow-sm ring-1 ring-black/5 backdrop-blur transition hover:-translate-y-0.5 hover:bg-white/90 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700 sm:flex-row sm:gap-4 sm:p-5 sm:text-left"
    >
      {/* A soft wash behind the art so the glass reads against the card
          rather than floating on flat white. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-green-50/70 via-transparent to-transparent"
      />

      <span className="relative flex h-20 w-20 shrink-0 items-center justify-center sm:h-28 sm:w-28 lg:h-32 lg:w-32">
        {tile.art ? (
          <img
            src={tile.art}
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
            width={224}
            height={224}
            className="h-full w-full object-contain drop-shadow-sm transition group-hover:scale-[1.04]"
          />
        ) : (
          <ArtworkPending />
        )}
      </span>

      {/* The title wraps rather than truncating. `truncate` keeps the
          line on one row, and a centred row that overruns its card gets
          clipped at BOTH ends -- which turned "வானிலை & ஆலோசனை" into
          "ானிலை & ஆலோசனை" on a phone. Tamil, Telugu and Hindi labels are
          routinely longer than the English they were laid out against. */}
      <span className="relative flex min-w-0 flex-col">
        <span className="line-clamp-2 text-sm font-semibold text-gray-900 sm:text-lg">{name}</span>
        <span className="mt-0.5 line-clamp-2 text-xs text-gray-500 sm:text-sm">{t(tile.descKey)}</span>
      </span>
    </Link>
  );
}

/**
 * Stand-in for the four modules whose artwork has not been made yet.
 *
 * Deliberately a frosted, empty pane: it matches the card system so the
 * grid stays even, and it is plainly a placeholder rather than a picture
 * borrowed from another module, which would quietly mislabel the page.
 */
function ArtworkPending() {
  const { t } = useTranslation();
  return (
    <span
      title={t("dashboard.artworkPending")}
      className="flex h-full w-full items-center justify-center rounded-2xl border border-dashed border-green-700/25 bg-gradient-to-br from-white/80 via-green-50/60 to-emerald-100/50 shadow-inner"
    >
      <span
        aria-hidden="true"
        className="h-8 w-8 rounded-full border border-green-700/20 bg-white/70 shadow-sm sm:h-10 sm:w-10"
      />
    </span>
  );
}
