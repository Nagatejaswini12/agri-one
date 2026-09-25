import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useFarmerProfile } from "@/modules/profile/hooks";
import { useFarms } from "@/modules/farms/hooks";
import { useSoilRecords } from "@/modules/soil-water/hooks";
import { useAppStore } from "@/stores/useAppStore";
import { EmptyState } from "@/components/EmptyState";
import { Briefing } from "@/modules/dashboard/Briefing";
import { AgentCard } from "@/components/AgentCard";
import { HeroVideo } from "@/components/HeroVideo";
import { STAGES, SUPPORT_TILES, tilesForStage } from "@/app/agents";

/**
 * The home screen, rearranged around the artwork.
 *
 * Every piece of data on this page comes from the same hooks as before —
 * the farm, the soil record and the briefing are untouched. What changed
 * is the order and the weight: a hero, then the briefing, then the
 * modules as large cards grouped by the PLAN -> GROW -> PROTECT -> SELL
 * journey, instead of a column of small text blocks.
 */
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
  const greeting = profileLoading
    ? t("common.loading")
    : greetingName
      ? t("dashboard.greeting", { name: greetingName })
      : t("dashboard.greetingFallback");

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-8 pt-4 sm:px-6">
      <HeroVideo
        poster="/video/dashboard-hero-poster.webp"
        sources={[
          { src: "/video/dashboard-hero.webm", type: "video/webm" },
          { src: "/video/dashboard-hero.mp4", type: "video/mp4" }
        ]}
        alt={t("dashboard.heroAlt")}
        className="h-44 sm:h-60 lg:h-72"
      >
        <h1 className="text-lg font-semibold text-white drop-shadow sm:text-2xl">{greeting}</h1>
        {activeFarm ? (
          <p className="mt-1 text-sm text-white/90 drop-shadow sm:text-base">
            {activeFarm.name}
            {[activeFarm.district, activeFarm.state].filter(Boolean).length > 0
              ? ` · ${[activeFarm.district, activeFarm.state].filter(Boolean).join(", ")}`
              : ""}
          </p>
        ) : null}
      </HeroVideo>

      {farmsLoading ? <p className="mt-4 text-gray-500">{t("common.loading")}</p> : null}

      {!farmsLoading && (!farms || farms.length === 0) ? (
        <div className="mt-4">
          <EmptyState message={t("dashboard.noFarms")} actionLabel={t("farms.add")} actionTo="/farms" />
        </div>
      ) : null}

      {!farmsLoading && activeFarm ? (
        <section className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/60 bg-white/70 px-4 py-3 shadow-sm ring-1 ring-black/5 backdrop-blur">
          <div className="min-w-0">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              {t("dashboard.currentFarm")}
            </h2>
            <p className="truncate font-medium text-gray-900">{activeFarm.name}</p>
          </div>

          <div className="flex items-center gap-3">
            {farms && farms.length > 1 ? (
              <>
                <label htmlFor="dashboard-farm-select" className="sr-only">
                  {t("dashboard.switchFarm")}
                </label>
                <select
                  id="dashboard-farm-select"
                  value={activeFarm.id}
                  onChange={(e) => setActiveFarmId(e.target.value)}
                  className="rounded-lg border bg-white px-2 py-1 text-sm"
                >
                  {farms.map((farm) => (
                    <option key={farm.id} value={farm.id}>
                      {farm.name}
                    </option>
                  ))}
                </select>
              </>
            ) : null}
            <Link
              to={`/farms/${activeFarm.id}`}
              className="shrink-0 text-sm font-medium text-green-700 underline"
            >
              {t("dashboard.viewFarm")}
            </Link>
          </div>
        </section>
      ) : null}

      {/* The briefing still loads on its own, so the cards below render
          immediately rather than waiting on three agents. */}
      {activeFarm ? (
        <section className="mt-5 overflow-hidden rounded-2xl border border-white/60 bg-white/70 shadow-sm ring-1 ring-black/5 backdrop-blur">
          <div className="flex items-start gap-4 border-b border-black/5 bg-gradient-to-br from-emerald-50/90 to-white/40 px-4 py-4 sm:px-5">
            <img
              src="/agents/orchestrator.webp"
              alt=""
              aria-hidden="true"
              width={224}
              height={224}
              className="h-16 w-16 shrink-0 object-contain drop-shadow-sm sm:h-24 sm:w-24"
            />
            <div className="min-w-0 pt-1">
              <h2 className="text-base font-semibold text-gray-900 sm:text-lg">{t("decision.title")}</h2>
              <p className="mt-0.5 text-xs text-gray-600 sm:text-sm">{t("agent.orchestrator")}</p>
            </div>
          </div>
          <div className="px-1 pb-1">
            <Briefing farm={activeFarm} hideHeading />
          </div>
        </section>
      ) : null}

      {STAGES.map(({ stage, titleKey }) => (
        <section key={stage} className="mt-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t(titleKey)}</h2>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-4">
            {tilesForStage(stage).map((tile) => (
              <AgentCard key={tile.id} tile={tile} />
            ))}
          </div>
        </section>
      ))}

      <section className="mt-6">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          {t("dashboard.supportTools")}
        </h2>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {SUPPORT_TILES.map((tile) => (
            <AgentCard key={tile.id} tile={tile} />
          ))}
        </div>
      </section>

      {activeFarm ? (
        <section className="mt-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            {t("dashboard.soilSummary")}
          </h2>
          {latestSoil ? (
            <div className="mt-2 rounded-2xl border border-white/60 bg-white/70 p-4 text-sm shadow-sm ring-1 ring-black/5 backdrop-blur">
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

      <p className="mt-8 rounded-2xl border border-dashed border-gray-300 p-4 text-sm text-gray-500">
        {t("dashboard.agentsComingSoon")}
      </p>
    </div>
  );
}
