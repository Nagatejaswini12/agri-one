import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { WeatherForecastDay, WeatherSnapshot } from "@agri-one/shared-types";
import { useFarms } from "@/modules/farms/hooks";
import { useWeather } from "@/modules/weather/hooks";
import { useAppStore } from "@/stores/useAppStore";
import { EmptyState } from "@/components/EmptyState";
import { DataUnavailable } from "@/components/DataUnavailable";
import { PageHero } from "@/components/PageHero";
import { SelectorPanel } from "@/components/SelectorPanel";

/** A value the source didn't report renders as a dash, never as 0. */
function metric(value: number | null, unit: string): string {
  return value === null ? "—" : `${value}${unit}`;
}

function useConditionLabel() {
  const { t } = useTranslation();
  return (code: number | null): string =>
    code === null
      ? t("weather.wmo.unknown")
      : t(`weather.wmo.${code}`, { defaultValue: t("weather.wmo.unknown") });
}

function ForecastRow({ day }: { day: WeatherForecastDay }) {
  const { t } = useTranslation();
  const conditionLabel = useConditionLabel();
  return (
    <li className="flex items-center justify-between gap-3 border-t py-2 text-sm first:border-t-0">
      <div className="min-w-0">
        <p className="font-medium">
          {new Date(`${day.date}T00:00:00`).toLocaleDateString(undefined, {
            weekday: "short",
            day: "numeric",
            month: "short"
          })}
        </p>
        <p className="truncate text-agri-muted">{conditionLabel(day.weatherCode)}</p>
      </div>
      <div className="shrink-0 text-right">
        <p>
          {metric(day.temperatureMaxC, "°")} / {metric(day.temperatureMinC, "°")}
        </p>
        <p className="text-agri-muted">
          {t("weather.rainChance", {
            percent: day.precipitationProbabilityMaxPct ?? "—"
          })}{" "}
          · {metric(day.precipitationSumMm, " mm")}
        </p>
      </div>
    </li>
  );
}

function WeatherView({ data, asOf, source }: { data: WeatherSnapshot; asOf: string; source: string }) {
  const { t } = useTranslation();
  const conditionLabel = useConditionLabel();
  const { current, forecast, advisories } = data;

  return (
    <div className="mt-4 space-y-4">
      <section className="rounded-lg border bg-agri-bark p-4">
        <h2 className="text-sm font-medium text-agri-mist">{t("weather.currentConditions")}</h2>
        <p className="mt-1 text-3xl font-semibold">{metric(current.temperatureC, "°C")}</p>
        <p className="text-agri-mist">{conditionLabel(current.weatherCode)}</p>
        <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
          <div>
            <dt className="text-agri-muted">{t("weather.humidity")}</dt>
            <dd>{metric(current.relativeHumidityPct, "%")}</dd>
          </div>
          <div>
            <dt className="text-agri-muted">{t("weather.wind")}</dt>
            <dd>{metric(current.windSpeedKph, " km/h")}</dd>
          </div>
          <div>
            <dt className="text-agri-muted">{t("weather.precipitation")}</dt>
            <dd>{metric(current.precipitationMm, " mm")}</dd>
          </div>
        </dl>
      </section>

      {advisories.length > 0 ? (
        <section className="rounded-lg border border-agri-amber/30 bg-agri-amber/10 p-4">
          <h2 className="text-sm font-medium text-agri-amber">{t("weather.advisories")}</h2>
          <ul className="mt-2 space-y-1 text-sm text-agri-amber">
            {advisories.map((flag) => (
              <li key={flag}>• {t(`weather.advisory.${flag}`)}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-agri-amber opacity-80">{t("weather.advisoryNote")}</p>
        </section>
      ) : null}

      {forecast.length > 0 ? (
        <section className="rounded-lg border bg-agri-bark p-4">
          <h2 className="text-sm font-medium text-agri-mist">{t("weather.forecastTitle")}</h2>
          <ul className="mt-1">
            {forecast.map((day) => (
              <ForecastRow key={day.date} day={day} />
            ))}
          </ul>
        </section>
      ) : null}

      <p className="text-xs text-agri-muted">
        {t("weather.sourceNote", { source })}
        {current.observedAt ? ` · ${t("weather.readingTime", { time: current.observedAt.replace("T", " ") })}` : ""}
        {data.timezone ? ` (${data.timezone})` : ""}
        {` · ${t("weather.fetchedAt", { time: new Date(asOf).toLocaleTimeString() })}`}
      </p>
    </div>
  );
}

export default function WeatherPage() {
  const { t } = useTranslation();
  const { data: farms, isLoading: farmsLoading } = useFarms();
  const activeFarmId = useAppStore((s) => s.activeFarmId);
  const setActiveFarmId = useAppStore((s) => s.setActiveFarmId);

  useEffect(() => {
    if (!activeFarmId && farms && farms.length > 0) {
      setActiveFarmId(farms[0].id);
    }
  }, [activeFarmId, farms, setActiveFarmId]);

  const activeFarm = farms?.find((f) => f.id === activeFarmId);
  const hasCoordinates = activeFarm?.latitude != null && activeFarm?.longitude != null;
  const { data: result, isLoading: weatherLoading, isError } = useWeather(activeFarm);

  return (
    <div className="p-6">
      <PageHero id="weather" titleKey="nav.weather" descKey="agent.weather" art="/agents/weather.webp" />

      {farmsLoading ? <p className="mt-4 text-agri-muted">{t("common.loading")}</p> : null}

      {!farmsLoading && (!farms || farms.length === 0) ? (
        <div className="mt-4">
          <EmptyState message={t("weather.noFarm")} actionLabel={t("farms.add")} actionTo="/farms" />
        </div>
      ) : null}

      {!farmsLoading && farms && farms.length > 0 ? (
        <>
          <SelectorPanel id="weather">
            <label htmlFor="weather-farm-select" className="block text-xs font-semibold text-agri-muted">
              {t("soil.selectFarm")}
            </label>
            <select
              id="weather-farm-select"
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

          {activeFarm && !hasCoordinates ? (
            <div className="mt-4">
              <EmptyState
                message={t("weather.noCoordinates")}
                actionLabel={t("weather.setLocation")}
                actionTo={`/farms/${activeFarm.id}`}
              />
            </div>
          ) : null}

          {hasCoordinates && weatherLoading ? (
            <p className="mt-4 text-agri-muted">{t("common.loading")}</p>
          ) : null}

          {hasCoordinates && isError ? (
            <div className="mt-4">
              <DataUnavailable reason={t("weather.loadError")} />
            </div>
          ) : null}

          {hasCoordinates && result && result.status === "unavailable" ? (
            <div className="mt-4">
              <DataUnavailable reason={result.reason} />
            </div>
          ) : null}

          {hasCoordinates && result && result.status === "ok" ? (
            <WeatherView data={result.data} asOf={result.asOf} source={result.source} />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
