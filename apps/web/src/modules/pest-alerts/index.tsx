import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import type { DiagnosisConfidenceLevel } from "@agri-one/shared-types";
import { useFarms, useFarmCrops } from "@/modules/farms/hooks";
import { useScans } from "@/modules/scan-crop/hooks";
import { useAppStore } from "@/stores/useAppStore";
import { EmptyState } from "@/components/EmptyState";
import { resourcesForState } from "./officialResources";
import {
  DEFAULT_WINDOW_DAYS,
  selectPestActivity,
  type PestActivityRecord
} from "./selectPestActivity";
import { PageHero } from "@/components/PageHero";
import { SelectorPanel } from "@/components/SelectorPanel";

/**
 * "Pest Activity on Your Farm".
 *
 * Every line on this page is a record of something that happened: a
 * photo the farmer took, on a date, that the Crop Diagnosis model
 * classified as a pest. There is no risk score, no forecast, no weather
 * input and no treatment advice anywhere in this module — for what to
 * do about a pest, the page sends the farmer to the officials whose job
 * that is.
 *
 * Reuses the existing RLS-scoped scans query rather than adding one:
 * these rows were already fetched for this farm, and Supabase has
 * already scoped them to the signed-in farmer.
 */

const CONFIDENCE_BADGE: Record<DiagnosisConfidenceLevel, string> = {
  high: "bg-agri-emerald/15 text-agri-emerald",
  medium: "bg-agri-amber/15 text-agri-amber",
  low: "bg-white/10 text-agri-mist"
};

function PestRow({ record }: { record: PestActivityRecord }) {
  const { t } = useTranslation();

  return (
    <li className="rounded-lg border bg-agri-bark p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">{record.label}</p>
          <p className="mt-0.5 text-sm text-agri-muted">
            {record.cropName ?? t("scanHistory.unknownCrop")} ·{" "}
            {t("pestActivity.scannedOn", {
              date: new Date(record.scannedAt).toLocaleDateString()
            })}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
            CONFIDENCE_BADGE[record.confidenceLevel]
          }`}
        >
          {t(`scanCrop.confidenceLevel.${record.confidenceLevel}`)}
        </span>
      </div>

      {/* The existing Crop Diagnosis wording, unchanged: a model score,
          stated as a model score. */}
      <p className="mt-1 text-xs text-agri-muted">
        {t("scanCrop.modelEstimate", { percent: Math.round(record.confidence * 100) })}
      </p>
      <p className="mt-0.5 text-xs text-agri-muted">{t("scanCrop.notCalibratedNote")}</p>

      {record.recommendExpertConsult ? (
        <p className="mt-2 text-xs text-agri-amber">
          {t("scanCrop.consultExpert")}
          {record.expertConsultReason ? ` — ${record.expertConsultReason}` : null}
        </p>
      ) : null}
    </li>
  );
}

function OfficialResources({ state }: { state: string | null }) {
  const { t } = useTranslation();
  const resources = resourcesForState(state);

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">{t("pestActivity.resources.title")}</h2>
      <p className="mt-1 text-sm text-agri-mist">{t("pestActivity.resources.intro")}</p>

      {resources.length === 0 ? (
        <p className="mt-3 text-sm text-agri-muted">{t("pestActivity.resources.none")}</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {resources.map((r) => (
            <li key={r.id} className="rounded-lg border bg-agri-bark p-4">
              <a
                href={r.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-agri-emerald underline"
              >
                {r.name}
              </a>
              <p className="mt-1 text-sm text-agri-mist">{r.purpose}</p>
              <p className="mt-1 text-xs text-agri-muted">{r.sourceName}</p>
              <p className="mt-0.5 text-xs text-agri-muted">
                {t("pestActivity.resources.checkedOn", {
                  date: new Date(r.lastVerifiedOn).toLocaleDateString()
                })}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function PestAlertsPage() {
  const { t } = useTranslation();
  const { data: farms, isLoading: farmsLoading } = useFarms();
  const activeFarmId = useAppStore((s) => s.activeFarmId);
  const setActiveFarmId = useAppStore((s) => s.setActiveFarmId);

  useEffect(() => {
    if (!activeFarmId && farms && farms.length > 0) {
      setActiveFarmId(farms[0].id);
    }
  }, [activeFarmId, farms, setActiveFarmId]);

  const { data: scans, isLoading: scansLoading, isError } = useScans(activeFarmId ?? undefined);
  const { data: crops } = useFarmCrops(activeFarmId ?? undefined);

  const records = useMemo(() => selectPestActivity(scans, crops), [scans, crops]);

  const farm = farms?.find((f) => f.id === activeFarmId) ?? null;
  const hasFarms = !farmsLoading && farms && farms.length > 0;
  const ready = hasFarms && !scansLoading && !isError;

  return (
    <div className="p-6">
      <PageHero id="pest" titleKey="pestActivity.title" descKey="agent.pest" />
      <p className="mt-2 text-sm text-agri-mist">{t("pestActivity.intro")}</p>

      {farmsLoading ? <p className="mt-4 text-agri-muted">{t("common.loading")}</p> : null}

      {!farmsLoading && (!farms || farms.length === 0) ? (
        <div className="mt-4">
          <EmptyState
            message={t("scanCrop.noFarm")}
            actionLabel={t("farms.add")}
            actionTo="/farms"
          />
        </div>
      ) : null}

      {hasFarms ? (
        <>
          <SelectorPanel id="pest">
            <label
              htmlFor="pest-farm-select"
              className="block text-xs font-semibold text-agri-muted"
            >
              {t("soil.selectFarm")}
            </label>
            <select
              id="pest-farm-select"
              value={activeFarmId ?? ""}
              onChange={(e) => setActiveFarmId(e.target.value || null)}
              className="agri-field mt-1"
            >
              {farms.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </SelectorPanel>

          {scansLoading ? <p className="mt-4 text-agri-muted">{t("common.loading")}</p> : null}
          {isError ? (
            <p className="mt-4 text-agri-coral">{t("pestActivity.loadError")}</p>
          ) : null}

          {ready ? (
            <>
              <p className="mt-4 text-sm text-agri-muted">
                {t("pestActivity.windowNote", { days: DEFAULT_WINDOW_DAYS })}
              </p>

              {/* Two different empty states. "You have not scanned
                  anything" and "your scans found nothing" mean very
                  different things to a farmer, and collapsing them would
                  read as a clean bill of health nobody issued. */}
              {!scans || scans.length === 0 ? (
                <div className="mt-3">
                  <EmptyState
                    message={t("pestActivity.emptyNoScans")}
                    actionLabel={t("nav.scanCrop")}
                    actionTo="/scan-crop"
                  />
                </div>
              ) : records.length === 0 ? (
                <div className="mt-3">
                  <EmptyState
                    message={t("pestActivity.empty")}
                    actionLabel={t("pestActivity.seeAllScans")}
                    actionTo="/scan-history"
                  />
                </div>
              ) : (
                <>
                  <ul className="mt-3 space-y-3">
                    {records.map((r) => (
                      <PestRow key={r.scanId} record={r} />
                    ))}
                  </ul>
                  <Link
                    to="/scan-history"
                    className="mt-3 inline-block text-sm font-medium text-agri-emerald underline"
                  >
                    {t("pestActivity.seeAllScans")}
                  </Link>
                </>
              )}
            </>
          ) : null}

          <OfficialResources state={farm?.state ?? null} />

          <p className="mt-6 text-xs text-agri-muted">{t("pestActivity.notPredicted")}</p>
          <p className="mt-1 text-xs text-agri-muted">{t("pestActivity.noTreatmentAdvice")}</p>
        </>
      ) : null}
    </div>
  );
}
