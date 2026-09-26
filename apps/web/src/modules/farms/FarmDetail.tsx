import { useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  useFarm,
  useUpdateFarm,
  useDeleteFarm,
  useFarmCrops,
  useCreateFarmCrop,
  useDeleteFarmCrop
} from "@/modules/farms/hooks";
import { FarmForm } from "@/modules/farms/FarmForm";
import { EmptyState } from "@/components/EmptyState";
import { useAppStore } from "@/stores/useAppStore";

export default function FarmDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { farmId } = useParams<{ farmId: string }>();
  const { data: farm, isLoading, isError } = useFarm(farmId);
  const updateFarm = useUpdateFarm();
  const deleteFarm = useDeleteFarm();
  const [editing, setEditing] = useState(false);
  const setActiveFarmId = useAppStore((s) => s.setActiveFarmId);

  const { data: crops, isLoading: cropsLoading } = useFarmCrops(farmId);
  const createCrop = useCreateFarmCrop(farmId ?? "");
  const deleteCrop = useDeleteFarmCrop(farmId ?? "");
  const [showCropForm, setShowCropForm] = useState(false);
  const [cropName, setCropName] = useState("");
  const [variety, setVariety] = useState("");
  const [sowingDate, setSowingDate] = useState("");
  const [currentStage, setCurrentStage] = useState("");

  if (isLoading) return <p className="p-6 text-agri-muted">{t("common.loading")}</p>;
  if (isError || !farm) return <p className="p-6 text-agri-coral">{t("farms.loadError")}</p>;

  async function handleAddCrop(e: React.FormEvent) {
    e.preventDefault();
    if (!cropName.trim()) return;
    await createCrop.mutateAsync({
      cropName: cropName.trim(),
      variety: variety.trim() || null,
      sowingDate: sowingDate || null,
      currentStage: currentStage.trim() || null
    });
    setCropName("");
    setVariety("");
    setSowingDate("");
    setCurrentStage("");
    setShowCropForm(false);
  }

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold">{farm.name}</h1>

      {!editing ? (
        <div className="mt-4 space-y-1 text-agri-mist">
          <p>{[farm.district, farm.state].filter(Boolean).join(", ") || t("farms.locationNotSet")}</p>
          <p>{farm.areaAcres !== null ? t("farms.areaValue", { value: farm.areaAcres }) : t("farms.areaNotSet")}</p>
          <p className="text-sm text-agri-muted">
            {farm.latitude !== null && farm.longitude !== null
              ? `${farm.latitude.toFixed(5)}, ${farm.longitude.toFixed(5)}`
              : t("farms.locationNotSet")}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setActiveFarmId(farm.id);
                navigate("/soil-water");
              }}
              className="rounded border px-3 py-1.5 text-sm font-medium text-agri-emerald"
            >
              {t("farms.viewSoilData")}
            </button>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded border px-3 py-1.5 text-sm font-medium text-agri-mist"
            >
              {t("common.edit")}
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirm(t("farms.deleteConfirm"))) {
                  deleteFarm.mutate(farm.id, { onSuccess: () => navigate("/farms") });
                }
              }}
              className="rounded border border-agri-coral/30 px-3 py-1.5 text-sm font-medium text-agri-coral"
            >
              {t("common.delete")}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-lg border bg-agri-bark p-4">
          <FarmForm
            initial={{
              name: farm.name,
              latitude: farm.latitude,
              longitude: farm.longitude,
              state: farm.state,
              district: farm.district,
              areaAcres: farm.areaAcres
            }}
            pending={updateFarm.isPending}
            submitLabel={t("common.save")}
            onSubmit={async (input) => {
              await updateFarm.mutateAsync({ id: farm.id, input });
              setEditing(false);
            }}
          />
        </div>
      )}

      <h2 className="mt-8 text-lg font-semibold">{t("farms.crops")}</h2>
      {cropsLoading ? <p className="mt-2 text-agri-muted">{t("common.loading")}</p> : null}
      {!cropsLoading && crops && crops.length === 0 ? (
        <div className="mt-2">
          <EmptyState message={t("farms.cropsEmpty")} />
        </div>
      ) : null}
      {!cropsLoading && crops && crops.length > 0 ? (
        <ul className="mt-2 space-y-2">
          {crops.map((crop) => (
            <li key={crop.id} className="flex items-center justify-between rounded-lg border bg-agri-bark p-3">
              <div>
                <p className="font-medium">{crop.cropName}</p>
                <p className="text-sm text-agri-muted">
                  {[crop.variety, crop.currentStage].filter(Boolean).join(" · ") || t("farms.noCropDetails")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => deleteCrop.mutate(crop.id)}
                className="text-sm font-medium text-agri-coral"
              >
                {t("common.delete")}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {!showCropForm ? (
        <button
          type="button"
          onClick={() => setShowCropForm(true)}
          className="mt-3 rounded border px-3 py-1.5 text-sm font-medium text-agri-emerald"
        >
          {t("farms.addCrop")}
        </button>
      ) : (
        <form onSubmit={(e) => void handleAddCrop(e)} className="mt-3 space-y-2 rounded-lg border bg-agri-bark p-3">
          <input
            type="text"
            placeholder={t("farms.cropName") ?? undefined}
            value={cropName}
            onChange={(e) => setCropName(e.target.value)}
            className="agri-field w-full text-sm"
          />
          <input
            type="text"
            placeholder={t("farms.variety") ?? undefined}
            value={variety}
            onChange={(e) => setVariety(e.target.value)}
            className="agri-field w-full text-sm"
          />
          <input
            type="date"
            value={sowingDate}
            onChange={(e) => setSowingDate(e.target.value)}
            className="agri-field w-full text-sm"
          />
          <input
            type="text"
            placeholder={t("farms.currentStage") ?? undefined}
            value={currentStage}
            onChange={(e) => setCurrentStage(e.target.value)}
            className="agri-field w-full text-sm"
          />
          <button
            type="submit"
            disabled={createCrop.isPending}
            className="agri-button py-1.5 text-sm"
          >
            {createCrop.isPending ? t("common.saving") : t("common.save")}
          </button>
        </form>
      )}

      <Link to="/farms" className="mt-8 block text-sm font-medium text-agri-mist underline">
        {t("farms.backToFarms")}
      </Link>
    </div>
  );
}
