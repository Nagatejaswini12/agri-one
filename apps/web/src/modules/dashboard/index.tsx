import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useFarmerProfile } from "@/modules/profile/hooks";
import { useFarms, useFarmCrops } from "@/modules/farms/hooks";
import { useSoilRecords } from "@/modules/soil-water/hooks";
import { useScans } from "@/modules/scan-crop/hooks";
import { useAppStore } from "@/stores/useAppStore";
import { EmptyState } from "@/components/EmptyState";
import { Briefing } from "@/modules/dashboard/Briefing";
import { AgentCard } from "@/components/AgentCard";
import { CinematicBackdrop } from "@/components/CinematicBackdrop";
import { videoFor } from "@/app/pageMedia";
import { StatusStrip } from "@/components/StatusStrip";
import { AGENT_TILES, STAGES, TOOL_TILES, tilesForStage } from "@/app/agents";
import { accentFor, STAGE_ACCENT } from "@/app/theme";

/**
 * The home screen: a command centre rather than a list of links.
 *
 * Order is deliberate. The hero says where you are, the status strip
 * says what is known right now, the orchestrator card is the one thing
 * that reasons across everything, then the agents, then the farmer's own
 * tools, then the journey.
 *
 * Every figure on this page comes from the same hooks as before — the
 * farm, its crops, the soil record, the scans and the briefing are
 * untouched. What changed is weight and order.
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
  const { data: crops } = useFarmCrops(activeFarm?.id);
  const { data: scans } = useScans(activeFarm?.id);
  const latestSoil = soilRecords?.[0] ?? null;

  const greetingName = profile?.name || profile?.email?.split("@")[0] || null;
  const greeting = profileLoading
    ? t("common.loading")
    : greetingName
      ? t("dashboard.greeting", { name: greetingName })
      : t("dashboard.greetingFallback");

  const orchestrator = accentFor("orchestrator");
  const location = activeFarm
    ? [activeFarm.district, activeFarm.state].filter(Boolean).join(", ")
    : "";

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-10 pt-4 sm:px-6">
      {/* ---------------------------------------------------------- hero */}
      <section
        className="relative h-56 overflow-hidden rounded-card border border-white/10 shadow-card sm:h-80 lg:h-[26rem]"
        aria-label={t("dashboard.heroAlt")}
      >
        <CinematicBackdrop id="orchestrator" video={videoFor("dashboard")} />

        <div className="relative flex h-full flex-col justify-end p-5 sm:p-8 lg:p-10">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-agri-bright ring-1 ring-white/20 backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-agri-emerald" />
            {t("appName")}
          </span>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-agri-bright sm:text-4xl lg:text-5xl">
            {greeting}
          </h1>
          {activeFarm ? (
            <p className="mt-1.5 text-sm text-agri-mist sm:text-base">
              <span className="font-medium text-agri-bright">{activeFarm.name}</span>
              {location ? <span> · {location}</span> : null}
            </p>
          ) : null}
        </div>
      </section>

      {farmsLoading ? <p className="mt-4 text-agri-muted">{t("common.loading")}</p> : null}

      {!farmsLoading && (!farms || farms.length === 0) ? (
        <div className="mt-4">
          <EmptyState message={t("dashboard.noFarms")} actionLabel={t("farms.add")} actionTo="/farms" />
        </div>
      ) : null}

      {activeFarm ? (
        <StatusStrip farm={activeFarm} crops={crops} latestSoil={latestSoil} scans={scans} />
      ) : null}

      {/* ------------------------------------------------- farm selector */}
      {!farmsLoading && activeFarm && farms && farms.length > 1 ? (
        <div className="agri-card mt-3 flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
          <label htmlFor="dashboard-farm-select" className="agri-eyebrow">
            {t("dashboard.switchFarm")}
          </label>
          <select
            id="dashboard-farm-select"
            value={activeFarm.id}
            onChange={(e) => setActiveFarmId(e.target.value)}
            className="agri-field px-2 py-1 text-sm"
          >
            {farms.map((farm) => (
              <option key={farm.id} value={farm.id}>
                {farm.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {/* --------------------------------------------- orchestrator card */}
      {/* The focal point of the command centre: the one agent that reads
          across every other one. It gets the widest card, the largest
          artwork and the only multi-colour accent in the system. */}
      {activeFarm ? (
        <section
          className={`agri-card relative mt-5 overflow-hidden ring-1 ${orchestrator.ring}`}
        >
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${orchestrator.wash}`}
          />
          {/* A slow emerald field behind the artwork, so the card reads
              as lit from within rather than as a flat panel. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -left-16 -top-20 h-64 w-64 rounded-full bg-agri-emerald/15 blur-3xl animate-drift"
          />
          <div className="relative flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:gap-7 sm:p-7">
            <span className="relative shrink-0 self-start sm:self-center">
              <span
                aria-hidden="true"
                className="absolute inset-0 m-auto h-24 w-24 rounded-full bg-agri-emerald/25 blur-2xl sm:h-32 sm:w-32 lg:h-40 lg:w-40"
              />
              <img
                src="/agents/orchestrator.webp"
                alt=""
                aria-hidden="true"
                width={320}
                height={320}
                className="agri-art-glow relative h-28 w-28 animate-float object-contain sm:h-36 sm:w-36 lg:h-44 lg:w-44"
              />
            </span>
            <div className="min-w-0 flex-1">
              <span className={`agri-eyebrow ${orchestrator.chip} rounded-full px-2 py-0.5`}>
                {t("dashboard.orchestratorEyebrow")}
              </span>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-agri-bright sm:text-3xl">
                {t("decision.title")}
              </h2>
              <p className="mt-1 max-w-prose text-sm text-agri-mist">
                {t("dashboard.orchestratorBlurb")}
              </p>

              {/* What the briefing actually reasons over. Labels only —
                  no values, so this cannot imply a reading that has not
                  been fetched. */}
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {["farms", "weather", "market", "soil"].map((id) => {
                  const a = accentFor(id);
                  const label =
                    id === "farms" ? t("dashboard.currentFarm") : t(`nav.${id === "soil" ? "soilWater" : id}`);
                  return (
                    <li
                      key={id}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${a.chip}`}
                    >
                      {label}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>

          <div className="relative border-t border-white/12 bg-agri-bark/5 px-1 pb-1">
            <Briefing farm={activeFarm} hideHeading />
          </div>
        </section>
      ) : null}

      {/* -------------------------------------------------- the AI agents */}
      <section className="mt-7">
        <SectionHeading eyebrow={t("dashboard.agentsTitle")} note={t("dashboard.agentsNote")} />
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {AGENT_TILES.map((tile) => (
            <AgentCard key={tile.id} tile={tile} />
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------ the tools */}
      <section className="mt-7">
        <SectionHeading eyebrow={t("dashboard.toolsTitle")} note={t("dashboard.toolsNote")} />
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3">
          {TOOL_TILES.map((tile) => (
            <AgentCard key={tile.id} tile={tile} compact />
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------- the journey */}
      <section className="mt-8">
        <SectionHeading eyebrow={t("dashboard.journeyTitle")} note={t("dashboard.journeyNote")} />
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {STAGES.map(({ stage, titleKey }) => {
            const s = STAGE_ACCENT[stage];
            return (
              <div key={stage} className="agri-card overflow-hidden">
                <div className={`flex items-center gap-2 bg-gradient-to-r ${s.header} px-4 py-2.5`}>
                  <span className={`h-2 w-2 rounded-full ${s.dot}`} aria-hidden="true" />
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-agri-bright">
                    {t(titleKey)}
                  </h3>
                </div>
                <ul className="divide-y divide-white/8">
                  {tilesForStage(stage).map((tile) => (
                    <li key={tile.id}>
                      <Link
                        to={tile.to}
                        className="flex items-center gap-2 px-4 py-2.5 text-sm text-agri-mist transition hover:bg-agri-bark/5 motion-reduce:transition-none"
                      >
                        <span className="min-w-0 flex-1 truncate font-medium text-agri-bright">
                          {t(tile.labelKey)}
                        </span>
                        <span aria-hidden="true" className="text-agri-muted">
                          &rsaquo;
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      {/* -------------------------------------------------- soil snapshot */}
      {activeFarm ? (
        <section className="mt-7">
          <SectionHeading eyebrow={t("dashboard.soilSummary")} />
          {latestSoil ? (
            <div className={`agri-card mt-3 p-4 text-sm ring-1 ${accentFor("soil").ring}`}>
              <p className="text-agri-mist">
                {t("soil.ph")}: <span className="font-semibold text-agri-bright">{latestSoil.ph ?? "—"}</span>
                {" · "}
                {t("soil.soilType")}:{" "}
                <span className="font-semibold text-agri-bright">{latestSoil.soilType ?? "—"}</span>
              </p>
              <Link to="/soil-water" className="mt-2 inline-block font-medium text-agri-leaf underline">
                {t("dashboard.viewSoil")}
              </Link>
            </div>
          ) : (
            <div className="mt-3">
              <EmptyState message={t("soil.empty")} actionLabel={t("soil.addRecord")} actionTo="/soil-water" />
            </div>
          )}
        </section>
      ) : null}

      <p className="agri-card mt-8 p-4 text-sm text-agri-muted">{t("dashboard.agentsComingSoon")}</p>
    </div>
  );
}

function SectionHeading({ eyebrow, note }: { eyebrow: string; note?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <h2 className="text-base font-semibold text-agri-bright sm:text-lg">{eyebrow}</h2>
      {note ? <p className="text-xs text-agri-muted sm:text-sm">{note}</p> : null}
    </div>
  );
}
