import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useFarms, useCreateFarm } from "@/modules/farms/hooks";
import { FarmForm } from "@/modules/farms/FarmForm";
import { EmptyState } from "@/components/EmptyState";
import { useAppStore } from "@/stores/useAppStore";
import { PageHero } from "@/components/PageHero";

export default function FarmsPage() {
  const { t } = useTranslation();
  const { data: farms, isLoading, isError } = useFarms();
  const createFarm = useCreateFarm();
  const [showForm, setShowForm] = useState(false);
  const activeFarmId = useAppStore((s) => s.activeFarmId);
  const setActiveFarmId = useAppStore((s) => s.setActiveFarmId);

  return (
    <div className="p-6">
      <PageHero id="farms" titleKey="nav.farms" descKey="agent.farms" />

      {isLoading ? <p className="mt-4 text-agri-muted">{t("common.loading")}</p> : null}
      {isError ? <p className="mt-4 text-agri-coral">{t("farms.loadError")}</p> : null}

      {!isLoading && !isError && farms && farms.length === 0 && !showForm ? (
        <div className="mt-4">
          <EmptyState message={t("farms.empty")} />
        </div>
      ) : null}

      {!isLoading && !isError && farms && farms.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {farms.map((farm) => (
            <li key={farm.id} className="flex items-center justify-between rounded-lg border bg-agri-bark p-4">
              <div>
                <Link to={`/farms/${farm.id}`} className="font-medium text-agri-emerald">
                  {farm.name}
                </Link>
                <p className="text-sm text-agri-muted">
                  {[farm.district, farm.state].filter(Boolean).join(", ") || t("farms.locationNotSet")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveFarmId(farm.id)}
                disabled={activeFarmId === farm.id}
                className="rounded border px-3 py-1.5 text-sm font-medium text-agri-emerald disabled:opacity-40"
              >
                {activeFarmId === farm.id ? t("farms.selected") : t("farms.select")}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {!showForm ? (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="mt-4 agri-button"
        >
          {t("farms.add")}
        </button>
      ) : (
        <div className="mt-4 rounded-lg border bg-agri-bark p-4">
          <FarmForm
            pending={createFarm.isPending}
            submitLabel={t("farms.add")}
            onSubmit={async (input) => {
              await createFarm.mutateAsync(input);
              setShowForm(false);
            }}
          />
          {createFarm.isError ? <p className="mt-2 text-sm text-agri-coral">{t("farms.saveError")}</p> : null}
        </div>
      )}
    </div>
  );
}
