import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { CropDiagnosisResult } from "@agri-one/shared-types";
import { useFarms, useFarmCrops } from "@/modules/farms/hooks";
import { useDiagnoseCrop, type DiagnoseCropOutcome } from "@/modules/scan-crop/hooks";
import { useAppStore } from "@/stores/useAppStore";
import { EmptyState } from "@/components/EmptyState";
import { DataUnavailable } from "@/components/DataUnavailable";
import { PageHero } from "@/components/PageHero";
import { SelectorPanel } from "@/components/SelectorPanel";

const CONFIDENCE_BADGE: Record<CropDiagnosisResult["confidenceLevel"], string> = {
  high: "bg-agri-emerald/15 text-agri-emerald",
  medium: "bg-agri-amber/15 text-agri-amber",
  low: "bg-white/10 text-agri-mist"
};

function DiagnosisResultView({ data }: { data: CropDiagnosisResult }) {
  const { t } = useTranslation();
  const { primaryFinding, alternativePossibilities, visualEvidence, careGuidance } = data;

  return (
    <div className="mt-4 space-y-4 rounded-lg border bg-agri-bark p-4">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">{primaryFinding.label}</h2>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CONFIDENCE_BADGE[data.confidenceLevel]}`}>
            {t(`scanCrop.confidenceLevel.${data.confidenceLevel}`)}
          </span>
        </div>
        <p className="mt-1 text-sm text-agri-muted">
          {primaryFinding.category === "healthy"
            ? t("scanCrop.healthyNote")
            : primaryFinding.category === "inconclusive"
              ? t("scanCrop.inconclusiveNote")
              : t("scanCrop.modelEstimate", { percent: Math.round(primaryFinding.confidence * 100) })}
        </p>
        <p className="mt-1 text-xs text-agri-muted">{t("scanCrop.notCalibratedNote")}</p>
      </div>

      {data.recommendExpertConsult ? (
        <div className="rounded-lg border border-agri-amber/30 bg-agri-amber/10 p-3 text-sm text-agri-amber">
          <p className="font-medium">{t("scanCrop.consultExpert")}</p>
          {data.expertConsultReason ? <p className="mt-1 opacity-80">{data.expertConsultReason}</p> : null}
        </div>
      ) : null}

      {alternativePossibilities.length > 0 ? (
        <div>
          <h3 className="text-sm font-medium text-agri-mist">{t("scanCrop.otherPossibilities")}</h3>
          <ul className="mt-1 space-y-1 text-sm text-agri-mist">
            {alternativePossibilities.map((alt) => (
              <li key={alt.label} className="flex justify-between">
                <span>{alt.label}</span>
                <span className="text-agri-muted">{Math.round(alt.confidence * 100)}%</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {visualEvidence.length > 0 ? (
        <div>
          <h3 className="text-sm font-medium text-agri-mist">{t("scanCrop.visualEvidence")}</h3>
          <div className="mt-2 flex gap-2 overflow-x-auto">
            {visualEvidence.map((evidence) => (
              <img
                key={evidence.referenceImageUrl}
                src={evidence.referenceImageUrl}
                alt={t("scanCrop.visualEvidence")}
                className="h-20 w-20 flex-shrink-0 rounded object-cover"
              />
            ))}
          </div>
        </div>
      ) : null}

      {careGuidance.culturalPractices.length > 0 ? (
        <div>
          <h3 className="text-sm font-medium text-agri-mist">{t("scanCrop.careGuidance")}</h3>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-agri-mist">
            {careGuidance.culturalPractices.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {careGuidance.monitoring.length > 0 ? (
        <div>
          <h3 className="text-sm font-medium text-agri-mist">{t("scanCrop.monitoring")}</h3>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-agri-mist">
            {careGuidance.monitoring.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="border-t pt-3 text-xs text-agri-muted">
        {data.disclaimer || t("scanCrop.fallbackDisclaimer")}
      </p>
    </div>
  );
}

export default function ScanCropPage() {
  const { t } = useTranslation();
  const { data: farms, isLoading: farmsLoading } = useFarms();
  const activeFarmId = useAppStore((s) => s.activeFarmId);
  const setActiveFarmId = useAppStore((s) => s.setActiveFarmId);

  useEffect(() => {
    if (!activeFarmId && farms && farms.length > 0) {
      setActiveFarmId(farms[0].id);
    }
  }, [activeFarmId, farms, setActiveFarmId]);

  const { data: crops, isLoading: cropsLoading } = useFarmCrops(activeFarmId ?? undefined);
  const [selectedCropId, setSelectedCropId] = useState<string>("");
  useEffect(() => {
    if (!selectedCropId && crops && crops.length > 0) {
      setSelectedCropId(crops[0].id);
    }
  }, [crops, selectedCropId]);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const diagnoseCrop = useDiagnoseCrop();
  const [lastOutcome, setLastOutcome] = useState<DiagnoseCropOutcome | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null;
    setFile(selected);
    setLastOutcome(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(selected ? URL.createObjectURL(selected) : null);
  }

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit() {
    if (!file || !activeFarmId || !selectedCropId) return;
    const cropName = crops?.find((c) => c.id === selectedCropId)?.cropName ?? null;
    const outcome = await diagnoseCrop.mutateAsync({
      farmId: activeFarmId,
      cropId: selectedCropId,
      cropName,
      file
    });
    setLastOutcome(outcome);
  }

  const canSubmit = !!file && !!activeFarmId && !!selectedCropId && !diagnoseCrop.isPending;

  return (
    <div className="p-6">
      <PageHero id="diagnosis" titleKey="nav.scanCrop" descKey="agent.diagnosis" art="/agents/diagnosis.webp" />

      {farmsLoading ? <p className="mt-4 text-agri-muted">{t("common.loading")}</p> : null}

      {!farmsLoading && (!farms || farms.length === 0) ? (
        <div className="mt-4">
          <EmptyState message={t("scanCrop.noFarm")} actionLabel={t("farms.add")} actionTo="/farms" />
        </div>
      ) : null}

      {!farmsLoading && farms && farms.length > 0 ? (
        <>
          <SelectorPanel id="diagnosis">
            <label htmlFor="scan-farm-select" className="block text-xs font-semibold text-agri-muted">
              {t("soil.selectFarm")}
            </label>
            <select
              id="scan-farm-select"
              value={activeFarmId ?? ""}
              onChange={(e) => {
                setActiveFarmId(e.target.value || null);
                setSelectedCropId("");
              }}
              className="agri-field mt-1"
            >
              {farms.map((farm) => (
                <option key={farm.id} value={farm.id}>
                  {farm.name}
                </option>
              ))}
            </select>
          </SelectorPanel>

          {!cropsLoading && (!crops || crops.length === 0) ? (
            <div className="mt-4">
              <EmptyState message={t("scanCrop.noCrop")} />
            </div>
          ) : null}

          {crops && crops.length > 0 ? (
            <SelectorPanel id="diagnosis">
              <label htmlFor="scan-crop-select" className="block text-xs font-semibold text-agri-muted">
                {t("farms.cropName")}
              </label>
              <select
                id="scan-crop-select"
                value={selectedCropId}
                onChange={(e) => setSelectedCropId(e.target.value)}
                className="agri-field mt-1"
              >
                {crops.map((crop) => (
                  <option key={crop.id} value={crop.id}>
                    {crop.cropName}
                  </option>
                ))}
              </select>
            </SelectorPanel>
          ) : null}

          {crops && crops.length > 0 ? (
            <div className="mt-4 rounded-lg border bg-agri-bark p-4">
              <label htmlFor="scan-photo" className="block text-xs font-semibold text-agri-muted">
                {t("scanCrop.uploadPhoto")}
              </label>
              <input
                ref={fileInputRef}
                id="scan-photo"
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileChange}
                className="mt-1 block w-full text-sm"
              />

              {previewUrl ? (
                <img src={previewUrl} alt={t("scanCrop.uploadPhoto")} className="mt-3 h-40 w-40 rounded object-cover" />
              ) : null}

              {diagnoseCrop.isError ? (
                <div className="mt-2 text-sm text-agri-coral">
                  <p>{t("scanCrop.uploadError")}</p>
                  {diagnoseCrop.error instanceof Error && diagnoseCrop.error.message ? (
                    <p className="mt-1 text-xs opacity-75">{diagnoseCrop.error.message}</p>
                  ) : null}
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={!canSubmit}
                className="mt-3 agri-button"
              >
                {diagnoseCrop.isPending ? t("scanCrop.analyzing") : t("scanCrop.diagnose")}
              </button>
            </div>
          ) : null}

          {lastOutcome && lastOutcome.result.status === "unavailable" ? (
            <div className="mt-4">
              <DataUnavailable reason={lastOutcome.result.reason} />
            </div>
          ) : null}

          {lastOutcome && lastOutcome.result.status === "ok" ? (
            <>
              <DiagnosisResultView data={lastOutcome.result.data} />
              {lastOutcome.historySaveFailed ? (
                <p className="mt-2 rounded border border-agri-amber/30 bg-agri-amber/10 p-2 text-xs text-agri-amber">
                  {t("scanCrop.historySaveFailed")}
                </p>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
