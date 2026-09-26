import { useTranslation } from "react-i18next";

/**
 * Shared across every live-data module (weather, market, soil, schemes,
 * buyers). Renders honestly instead of a module inventing placeholder
 * values when a live source has no data.
 *
 * Given weight on purpose. This is the state a farmer will meet whenever
 * an upstream source is down, and a message that looks like an
 * afterthought invites the reading that something is broken in the app.
 * It says plainly that the data is not there — never a zero, never a
 * dash that could be mistaken for a reading.
 */
export function DataUnavailable({ reason }: { reason?: string }) {
  const { t } = useTranslation();
  return (
    <div className="agri-card relative overflow-hidden p-5 ring-1 ring-agri-amber/25">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-agri-amber/10 via-agri-amber/4 to-transparent"
      />
      <div className="relative flex items-start gap-3">
        <span
          aria-hidden="true"
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-agri-amber/15 text-agri-amber"
        >
          <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 8v5M12 16.5v.01" />
            <circle cx="12" cy="12" r="9" />
          </svg>
        </span>
        <div className="min-w-0">
          <p className="font-semibold text-agri-bright">{t("common.dataUnavailable")}</p>
          {reason ? <p className="mt-1 text-sm text-agri-mist">{reason}</p> : null}
        </div>
      </div>
    </div>
  );
}
