import { useTranslation } from "react-i18next";
import { accentFor } from "@/app/theme";
import { ModuleIcon } from "@/components/ModuleIcon";

/**
 * The banner a feature page opens with: its own artwork, its name, and
 * its accent — the same one its card carries on the dashboard, so
 * arriving on the page confirms you tapped what you meant to.
 *
 * Purely a frame. It takes no data and renders no value, so adding it to
 * a page cannot change what that page reports.
 */
export function PageHeader({
  id,
  titleKey,
  descKey,
  art
}: {
  id: string;
  titleKey: string;
  descKey?: string;
  art?: string | null;
}) {
  const { t } = useTranslation();
  const accent = accentFor(id);

  return (
    <header className={`agri-card relative overflow-hidden ring-1 ${accent.ring}`}>
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${accent.wash}`}
      />
      <div className="relative flex items-center gap-3 p-4 sm:gap-4 sm:p-5">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center sm:h-20 sm:w-20">
          {art ? (
            <img
              src={art}
              alt=""
              aria-hidden="true"
              width={320}
              height={320}
              className="h-full w-full object-contain drop-shadow-sm"
            />
          ) : (
            <ModuleIcon id={id} className="h-full w-full drop-shadow-sm" />
          )}
        </span>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-agri-forest sm:text-xl">{t(titleKey)}</h1>
          {descKey ? (
            <p className="mt-0.5 line-clamp-2 text-sm text-gray-600">{t(descKey)}</p>
          ) : null}
        </div>
      </div>
    </header>
  );
}
