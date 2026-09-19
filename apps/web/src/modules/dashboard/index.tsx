import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useFarmerProfile } from "@/modules/profile/hooks";
import { useFarms } from "@/modules/farms/hooks";
import { useSoilRecords } from "@/modules/soil-water/hooks";
import { useAppStore } from "@/stores/useAppStore";
import { EmptyState } from "@/components/EmptyState";

export default function DashboardPage() {
  const { t } = useTranslation();
  const { data: profile, isLoading: profileLoading } = useFarmerProfile();
  const { data: farms, isLoading: farmsLoading } = useFarms();
  const activeFarmId = useAppStore((s) => s.activeFarmId);
  const setActiveFarmId = useAppStore((s) => s.setActiveFarmId);

  useEffect(() => {
    if (!activeFarmId && farms && farms.length > 0) {
      setActiveFarmId(farms[0].id);
    }
  }, [activeFarmId, farms, setActiveFarmId]);

  const activeFarm = farms?.find((f) => f.id === activeFarmId) ?? null;
  const { data: soilRecords } = useSoilRecords(activeFarm?.id);
  const latestSoil = soilRecords?.[0] ?? null;

  const greetingName = profile?.name || profile?.email?.split("@")[0] || null;

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold">
        {profileLoading ? t("common.loading") : greetingName ? t("dashboard.greeting", { name: greetingName }) : t("dashboard.greetingFallback")}
      </h1>

      <section className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{t("dashboard.currentFarm")}</h2>

        {farmsLoading ? <p className="mt-2 text-gray-500">{t("common.loading")}</p> : null}

        {!farmsLoading && (!farms || farms.length === 0) ? (
          <div className="mt-2">
            <EmptyState message={t("dashboard.noFarms")} actionLabel={t("farms.add")} actionTo="/farms" />
          </div>
        ) : null}

        {!farmsLoading && activeFarm ? (
          <div className="mt-2 rounded-lg border bg-white p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{activeFarm.name}</p>
                <p className="text-sm text-gray-500">
                  {[activeFarm.district, activeFarm.state].filter(Boolean).join(", ") || t("farms.locationNotSet")}
                </p>
              </div>
              <Link to={`/farms/${activeFarm.id}`} className="text-sm font-medium text-green-700 underline">
                {t("dashboard.viewFarm")}
              </Link>
            </div>

            {farms && farms.length > 1 ? (
              <div className="mt-3">
                <label htmlFor="dashboard-farm-select" className="sr-only">
                  {t("dashboard.switchFarm")}
                </label>
                <select
                  id="dashboard-farm-select"
                  value={activeFarm.id}
                  onChange={(e) => setActiveFarmId(e.target.value)}
                  className="rounded border px-2 py-1 text-sm"
                >
                  {farms.map((farm) => (
                    <option key={farm.id} value={farm.id}>
                      {farm.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      {activeFarm ? (
        <section className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{t("dashboard.soilSummary")}</h2>
          {latestSoil ? (
            <div className="mt-2 rounded-lg border bg-white p-4 text-sm">
              <p>
                {t("soil.ph")}: {latestSoil.ph ?? "—"} · {t("soil.soilType")}: {latestSoil.soilType ?? "—"}
              </p>
              <Link to="/soil-water" className="mt-2 inline-block text-green-700 underline">
                {t("dashboard.viewSoil")}
              </Link>
            </div>
          ) : (
            <div className="mt-2">
              <EmptyState message={t("soil.empty")} actionLabel={t("soil.addRecord")} actionTo="/soil-water" />
            </div>
          )}
        </section>
      ) : null}

      <section className="mt-8 rounded-lg border border-dashed border-gray-300 p-4 text-sm text-gray-500">
        {t("dashboard.agentsComingSoon")}
      </section>
    </div>
  );
}
