import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { CropDiagnosisResult, Scan } from "@agri-one/shared-types";
import { useFarms, useFarmCrops } from "@/modules/farms/hooks";
import { useScans } from "@/modules/scan-crop/hooks";
import { useAppStore } from "@/stores/useAppStore";
import { EmptyState } from "@/components/EmptyState";
import { PageHero } from "@/components/PageHero";
import { SelectorPanel } from "@/components/SelectorPanel";

const CONFIDENCE_BADGE: Record<CropDiagnosisResult["confidenceLevel"], string> = {
  high: "bg-agri-emerald/15 text-agri-emerald",
  medium: "bg-agri-amber/15 text-agri-amber",
  low: "bg-white/10 text-agri-mist"
};

function ScanRow({ scan, cropName }: { scan: Scan; cropName: string | null }) {
  const { t } = useTranslation();
  const result = scan.diagnosisResult;
  const finding = result?.primaryFinding ?? null;
  // The row is written from an already-normalized result, but it's jsonb in
  // Postgres — an older or partial row must not crash the list.
  const level = result?.confidenceLevel ?? null;
  const confidence = finding?.confidence ?? scan.confidence;

  return (
    <li className="rounded-lg border bg-agri-bark p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">{finding?.label ?? t("scanHistory.noResult")}</p>
          <p className="mt-0.5 text-sm text-agri-muted">
            {cropName ?? t("scanHistory.unknownCrop")} ·{" "}
            {new Date(scan.createdAt).toLocaleString()}
          </p>
        </div>
        {level ? (
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${CONFIDENCE_BADGE[level]}`}>
            {t(`scanCrop.confidenceLevel.${level}`)}
          </span>
        ) : null}
      </div>

      {typeof confidence === "number" ? (
        <p className="mt-1 text-xs text-agri-muted">
          {t("scanCrop.modelEstimate", { percent: Math.round(confidence * 100) })}
        </p>
      ) : null}

      {result?.recommendExpertConsult ? (
        <p className="mt-2 text-xs text-agri-amber">{t("scanCrop.consultExpert")}</p>
      ) : null}
    </li>
  );
}

export default function ScanHistoryPage() {
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

  return (
    <div className="p-6">
      <PageHero id="scanHistory" titleKey="nav.scanHistory" descKey="agent.scanHistory" />

      {farmsLoading ? <p className="mt-4 text-agri-muted">{t("common.loading")}</p> : null}

      {!farmsLoading && (!farms || farms.length === 0) ? (
        <div className="mt-4">
          <EmptyState message={t("scanCrop.noFarm")} actionLabel={t("farms.add")} actionTo="/farms" />
        </div>
      ) : null}

      {!farmsLoading && farms && farms.length > 0 ? (
        <>
          <SelectorPanel id="scanHistory">
            <label htmlFor="history-farm-select" className="block text-xs font-semibold text-agri-muted">
              {t("soil.selectFarm")}
            </label>
            <select
              id="history-farm-select"
              value={activeFarmId ?? ""}
              onChange={(e) => setActiveFarmId(e.target.value || null)}
              className="agri-field mt-1"
            >
              {farms.map((farm) => (
                <option key={farm.id} value={farm.id}>
                  {farm.name}
                </option>
              ))}
            </select>
          </SelectorPanel>

          {scansLoading ? <p className="mt-4 text-agri-muted">{t("common.loading")}</p> : null}
          {isError ? <p className="mt-4 text-agri-coral">{t("scanHistory.loadError")}</p> : null}

          {!scansLoading && !isError && (!scans || scans.length === 0) ? (
            <div className="mt-4">
              <EmptyState
                message={t("scanHistory.empty")}
                actionLabel={t("nav.scanCrop")}
                actionTo="/scan-crop"
              />
            </div>
          ) : null}

          {!scansLoading && !isError && scans && scans.length > 0 ? (
            <ul className="mt-4 space-y-3">
              {scans.map((scan) => (
                <ScanRow
                  key={scan.id}
                  scan={scan}
                  cropName={crops?.find((c) => c.id === scan.cropId)?.cropName ?? null}
                />
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
