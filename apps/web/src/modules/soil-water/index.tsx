import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFarms } from "@/modules/farms/hooks";
import { useSoilRecords, useCreateSoilRecord, type SoilRecordInput } from "@/modules/soil-water/hooks";
import { useAppStore } from "@/stores/useAppStore";
import { EmptyState } from "@/components/EmptyState";
import { PageHero } from "@/components/PageHero";
import { SelectorPanel } from "@/components/SelectorPanel";

const SOIL_TYPES = ["sandy", "loamy", "clay", "silty", "black", "red", "alluvial"] as const;

const emptyInput: SoilRecordInput = {
  soilType: null,
  nitrogen: null,
  phosphorus: null,
  potassium: null,
  ph: null,
  organicCarbon: null,
  testedOn: null
};

export default function SoilWaterPage() {
  const { t } = useTranslation();
  const { data: farms, isLoading: farmsLoading } = useFarms();
  const activeFarmId = useAppStore((s) => s.activeFarmId);
  const setActiveFarmId = useAppStore((s) => s.setActiveFarmId);

  useEffect(() => {
    if (!activeFarmId && farms && farms.length > 0) {
      setActiveFarmId(farms[0].id);
    }
  }, [activeFarmId, farms, setActiveFarmId]);

  const { data: records, isLoading: recordsLoading, isError } = useSoilRecords(activeFarmId ?? undefined);
  const createSoilRecord = useCreateSoilRecord(activeFarmId ?? "");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<SoilRecordInput>(emptyInput);
  const [error, setError] = useState<string | null>(null);

  const latest = records?.[0] ?? null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (form.ph !== null && (form.ph < 0 || form.ph > 14)) {
      setError(t("soil.phRange"));
      return;
    }
    await createSoilRecord.mutateAsync(form);
    setForm(emptyInput);
    setShowForm(false);
  }

  return (
    <div className="p-6">
      <PageHero id="soil" titleKey="nav.soilWater" descKey="agent.soil" art="/agents/soil.webp" />

      {farmsLoading ? <p className="mt-4 text-agri-muted">{t("common.loading")}</p> : null}

      {!farmsLoading && (!farms || farms.length === 0) ? (
        <div className="mt-4">
          <EmptyState message={t("soil.noFarm")} actionLabel={t("farms.add")} actionTo="/farms" />
        </div>
      ) : null}

      {!farmsLoading && farms && farms.length > 0 ? (
        <>
          <SelectorPanel id="soil">
            <label htmlFor="soil-farm-select" className="block text-xs font-semibold text-agri-muted">
              {t("soil.selectFarm")}
            </label>
            <select
              id="soil-farm-select"
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

          {recordsLoading ? <p className="mt-4 text-agri-muted">{t("common.loading")}</p> : null}
          {isError ? <p className="mt-4 text-agri-coral">{t("soil.loadError")}</p> : null}

          {!recordsLoading && !isError && !latest ? (
            <div className="mt-4">
              <EmptyState message={t("soil.empty")} />
            </div>
          ) : null}

          {!recordsLoading && latest ? (
            <div className="mt-4 rounded-lg border bg-agri-bark p-4">
              <p className="text-sm text-agri-muted">
                {t("soil.testedOn")}: {latest.testedOn ?? t("soil.dateUnknown")}
              </p>
              <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <dt className="text-agri-muted">{t("soil.soilType")}</dt>
                <dd>{latest.soilType ?? "—"}</dd>
                <dt className="text-agri-muted">{t("soil.ph")}</dt>
                <dd>{latest.ph ?? "—"}</dd>
                <dt className="text-agri-muted">{t("soil.nitrogen")}</dt>
                <dd>{latest.nitrogen ?? "—"}</dd>
                <dt className="text-agri-muted">{t("soil.phosphorus")}</dt>
                <dd>{latest.phosphorus ?? "—"}</dd>
                <dt className="text-agri-muted">{t("soil.potassium")}</dt>
                <dd>{latest.potassium ?? "—"}</dd>
                <dt className="text-agri-muted">{t("soil.organicCarbon")}</dt>
                <dd>{latest.organicCarbon ?? "—"}</dd>
              </dl>
            </div>
          ) : null}

          {!showForm ? (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="mt-4 agri-button"
            >
              {t("soil.addRecord")}
            </button>
          ) : (
            <form onSubmit={(e) => void handleSubmit(e)} className="mt-4 space-y-3 rounded-lg border bg-agri-bark p-4">
              <div>
                <label htmlFor="soil-type" className="block text-xs font-semibold text-agri-muted">
                  {t("soil.soilType")}
                </label>
                <select
                  id="soil-type"
                  value={form.soilType ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, soilType: e.target.value || null }))}
                  className="agri-field mt-1 w-full"
                >
                  <option value="">{t("soil.unknown")}</option>
                  {SOIL_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {t(`soil.types.${type}`)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {(
                  [
                    ["ph", "ph"],
                    ["nitrogen", "nitrogen"],
                    ["phosphorus", "phosphorus"],
                    ["potassium", "potassium"],
                    ["organicCarbon", "organicCarbon"]
                  ] as const
                ).map(([field, labelKey]) => (
                  <div key={field}>
                    <label htmlFor={`soil-${field}`} className="block text-xs font-semibold text-agri-muted">
                      {t(`soil.${labelKey}`)}
                    </label>
                    <input
                      id={`soil-${field}`}
                      type="number"
                      step="0.01"
                      value={form[field] ?? ""}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, [field]: e.target.value ? Number(e.target.value) : null }))
                      }
                      className="agri-field mt-1 w-full"
                    />
                  </div>
                ))}
              </div>

              <div>
                <label htmlFor="soil-tested-on" className="block text-xs font-semibold text-agri-muted">
                  {t("soil.testedOn")}
                </label>
                <input
                  id="soil-tested-on"
                  type="date"
                  value={form.testedOn ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, testedOn: e.target.value || null }))}
                  className="agri-field mt-1 w-full"
                />
              </div>

              {error ? <p className="text-sm text-agri-coral">{error}</p> : null}
              {createSoilRecord.isError ? <p className="text-sm text-agri-coral">{t("soil.saveError")}</p> : null}

              <button
                type="submit"
                disabled={createSoilRecord.isPending}
                className="agri-button"
              >
                {createSoilRecord.isPending ? t("common.saving") : t("common.save")}
              </button>
            </form>
          )}
        </>
      ) : null}
    </div>
  );
}
