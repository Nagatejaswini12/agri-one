import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { accentFor } from "@/app/theme";
import { videoFor } from "@/app/pageMedia";
import { ModuleIcon } from "@/components/ModuleIcon";
import { CinematicBackdrop } from "@/components/CinematicBackdrop";

/**
 * The cinematic header every feature page opens with.
 *
 * A module's own footage or drifting accent behind it, its small icon
 * and name, one line of description, and its artwork lit from behind —
 * so arriving on a page confirms you tapped what you meant to, and the
 * page announces itself before any data has loaded.
 *
 * Purely a frame. It takes translation keys and optional children, it
 * renders no value of its own, and it fetches nothing. Adding it to a
 * page cannot change what that page reports.
 */
export function PageHero({
  id,
  titleKey,
  descKey,
  art,
  status,
  video = true
}: {
  id: string;
  titleKey: string;
  descKey?: string;
  /** Supplied artwork; when absent the module's drawn icon stands in. */
  art?: string | null;
  /** Live status from the page itself — never invented here. */
  status?: ReactNode;
  /** Set false to keep a page on gradient even if footage exists. */
  video?: boolean;
}) {
  const { t } = useTranslation();
  const accent = accentFor(id);
  const clip = video ? videoFor(id) : null;

  return (
    <header
      className={`relative overflow-hidden rounded-card border shadow-card ${
        // Market Analysis is the one hero whose accent was getting lost.
        // Amber sits close to the warm field already in the background
        // gradient, so at the same weight as cyan or violet it read as
        // no accent at all. It gets a visible edge rather than a
        // brighter colour — the hue is unchanged.
        id === "market" ? "border-agri-amber/25" : "border-white/10"
      }`}
    >
      <CinematicBackdrop id={id} video={clip} strength={id === "market" ? "strong" : "normal"} />

      <div className="relative flex items-center gap-4 p-5 sm:gap-6 sm:p-7 lg:p-8">
        <div className="min-w-0 flex-1">
          <span className="inline-flex items-center gap-2">
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center ${accent.text}`}>
              <ModuleIcon id={id} className="h-full w-full" />
            </span>
            <span className={`agri-eyebrow ${accent.text}`}>{t("appName")}</span>
          </span>

          <h1 className="mt-2 text-xl font-semibold tracking-tight text-agri-bright sm:text-3xl lg:text-4xl">
            {t(titleKey)}
          </h1>

          {descKey ? (
            <p className="mt-1.5 max-w-prose text-sm text-agri-mist sm:text-base">{t(descKey)}</p>
          ) : null}

          {status ? <div className="mt-3">{status}</div> : null}
        </div>

        {/* The artwork, lit rather than boxed. The halo is the accent at
            low opacity behind a transparent image, so it reads as part
            of the environment instead of pasted onto it. */}
        <div className="relative hidden shrink-0 sm:block">
          <span
            aria-hidden="true"
            className={`absolute inset-0 m-auto rounded-full blur-2xl ${accent.glow} ${
              // A wider, fuller halo where the accent needs the help, so
              // a transparent render has something to sit against
              // instead of dissolving into the dark.
              id === "market"
                ? "h-32 w-32 opacity-100 lg:h-40 lg:w-40"
                : "h-24 w-24 lg:h-32 lg:w-32"
            }`}
          />
          <span className="relative flex h-24 w-24 items-center justify-center lg:h-32 lg:w-32">
            {art ? (
              <img
                src={art}
                alt=""
                aria-hidden="true"
                width={320}
                height={320}
                className="agri-art-glow h-full w-full animate-float object-contain"
              />
            ) : (
              <ModuleIcon id={id} className="agri-art-glow h-full w-full animate-float" />
            )}
          </span>
        </div>
      </div>
    </header>
  );
}
