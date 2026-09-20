import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { CropDiagnosisResult } from "@agri-one/shared-types";
import { useFarms, useFarmCrops } from "@/modules/farms/hooks";
import { useDiagnoseCrop, type DiagnoseCropOutcome } from "@/modules/scan-crop/hooks";
import { useAppStore } from "@/stores/useAppStore";
import { EmptyState } from "@/components/EmptyState";
import { DataUnavailable } from "@/components/DataUnavailable";

const CONFIDENCE_BADGE: Record<CropDiagnosisResult["confidenceLevel"], string> = {
  high: "bg-green-100 text-green-800",
  medium: "bg-amber-100 text-amber-800",
  low: "bg-gray-200 text-gray-700"
};

function DiagnosisResultView({ data }: { data: CropDiagnosisResult }) {
  const { t } = useTranslation();
  const { primaryFinding, alternativePossibilities, visualEvidence, careGuidance } = data;

  return (
    <div className="mt-4 space-y-4 rounded-lg border bg-white p-4">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">{primaryFinding.label}</h2>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CONFIDENCE_BADGE[data.confidenceLevel]}`}>
            {t(`scanCrop.confidenceLevel.${data.confidenceLevel}`)}
          </span>
        </div>
        <p className="mt-1 text-sm text-gray-500">
          {primaryFinding.category === "healthy"
            ? t("scanCrop.healthyNote")
            : primaryFinding.category === "inconclusive"
              ? t("scanCrop.inconclusiveNote")
              : t("scanCrop.modelEstimate", { percent: Math.round(primaryFinding.confidence * 100) })}
        </p>
        <p className="mt-1 text-xs text-gray-400">{t("scanCrop.notCalibratedNote")}</p>
      </div>

      {data.recommendExpertConsult ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-medium">{t("scanCrop.consultExpert")}</p>
          {data.expertConsultReason ? <p className="mt-1 opacity-80">{data.expertConsultReason}</p> : null}
        </div>
      ) : null}

      {alternativePossibilities.length > 0 ? (
        <div>
          <h3 className="text-sm font-medium text-gray-700">{t("scanCrop.otherPossibilities")}</h3>
          <ul className="mt-1 space-y-1 text-sm text-gray-600">
            {alternativePossibilities.map((alt) => (
              <li key={alt.label} className="flex justify-between">
                <span>{alt.label}</span>
                <span className="text-gray-400">{Math.round(alt.confidence * 100)}%</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {visualEvidence.length > 0 ? (
        <div>
          <h3 className="text-sm font-medium text-gray-700">{t("scanCrop.visualEvidence")}</h3>
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
          <h3 className="text-sm font-medium text-gray-700">{t("scanCrop.careGuidance")}</h3>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-gray-600">
            {careGuidance.culturalPractices.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {careGuidance.monitoring.length > 0 ? (
        <div>
          <h3 className="text-sm font-medium text-gray-700">{t("scanCrop.monitoring")}</h3>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-gray-600">
            {careGuidance.monitoring.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="border-t pt-3 text-xs text-gray-500">
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
      <h1 className="text-xl font-semibold">{t("nav.scanCrop")}</h1>

      {farmsLoading ? <p className="mt-4 text-gray-500">{t("common.loading")}</p> : null}

      {!farmsLoading && (!farms || farms.length === 0) ? (
        <div className="mt-4">
          <EmptyState message={t("scanCrop.noFarm")} actionLabel={t("farms.add")} actionTo="/farms" />
        </div>
      ) : null}

      {!farmsLoading && farms && farms.length > 0 ? (
        <>
          <div className="mt-4">
            <label htmlFor="scan-farm-select" className="block text-sm font-medium text-gray-700">
              {t("soil.selectFarm")}
            </label>
            <select
              id="scan-farm-select"
              value={activeFarmId ?? ""}
              onChange={(e) => {
                setActiveFarmId(e.target.value || null);
                setSelectedCropId("");
              }}
              className="mt-1 rounded border px-3 py-2"
            >
              {farms.map((farm) => (
                <option key={farm.id} value={farm.id}>
                  {farm.name}
                </option>
              ))}
            </select>
          </div>

          {!cropsLoading && (!crops || crops.length === 0) ? (
            <div className="mt-4">
              <EmptyState message={t("scanCrop.noCrop")} />
            </div>
          ) : null}

          {crops && crops.length > 0 ? (
            <div className="mt-4">
              <label htmlFor="scan-crop-select" className="block text-sm font-medium text-gray-700">
                {t("farms.cropName")}
              </label>
              <select
                id="scan-crop-select"
                value={selectedCropId}
                onChange={(e) => setSelectedCropId(e.target.value)}
                className="mt-1 rounded border px-3 py-2"
              >
                {crops.map((crop) => (
                  <option key={crop.id} value={crop.id}>
                    {crop.cropName}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {crops && crops.length > 0 ? (
            <div className="mt-4 rounded-lg border bg-white p-4">
              <label htmlFor="scan-photo" className="block text-sm font-medium text-gray-700">
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
                <div className="mt-2 text-sm text-red-600">
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
                className="mt-3 rounded bg-green-700 px-4 py-2 font-medium text-white disabled:opacity-50"
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
                <p className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
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
