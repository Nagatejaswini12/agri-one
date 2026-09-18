import { useTranslation } from "react-i18next";

/**
 * Shared across every live-data module (weather, market, soil, schemes,
 * buyers). Renders honestly instead of a module inventing placeholder
 * values when a live source has no data.
 */
export function DataUnavailable({ reason }: { reason?: string }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900">
      <p className="font-medium">{t("common.dataUnavailable")}</p>
      {reason ? <p className="mt-1 text-sm opacity-80">{reason}</p> : null}
    </div>
  );
}
