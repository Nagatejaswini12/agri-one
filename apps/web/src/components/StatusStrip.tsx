import { useTranslation } from "react-i18next";
import type { Farm, FarmCrop, SoilRecord, Scan } from "@agri-one/shared-types";
import { useWeather } from "@/modules/weather/hooks";
import { accentFor } from "@/app/theme";

/**
 * The at-a-glance strip.
 *
 * Every tile here shows a value the app already holds, or it says it has
 * none. There is no default, no placeholder figure and no rounding of
 * "unknown" towards "fine": a farm with no soil record says so, and the
 * weather tile reports the agent's own unavailable state rather than a
 * dash that could be read as a reading.
 *
 * That restraint is the point of the strip. Anything invented here would
 * be read as a fact about someone's field.
 */

interface Props {
  farm: Farm;
  crops: FarmCrop[] | undefined;
  latestSoil: SoilRecord | null;
  scans: Scan[] | undefined;
}

export function StatusStrip({ farm, crops, latestSoil, scans }: Props) {
  const { t } = useTranslation();
  const weather = useWeather(farm);

  // The weather agent can be loading, unavailable, or holding a reading
  // — and an "ok" reading can still carry a null temperature, which
  // Math.round would turn into "NaN°C". All four cases are distinct and
  // only a real number is ever printed.
  const currentTemp =
    weather.data?.status === "ok" ? weather.data.data.current.temperatureC : null;
  const weatherValue = weather.isLoading
    ? null
    : typeof currentTemp === "number" && Number.isFinite(currentTemp)
      ? `${Math.round(currentTemp)}°C`
      : undefined;

  const activeCrops = (crops ?? []).filter((c) => c.status === "active");
  const latestScan = scans?.[0] ?? null;

  const location = [farm.district, farm.state].filter(Boolean).join(", ");

  const tiles: { id: string; label: string; value: string | null | undefined }[] = [
    {
      id: "weather",
      label: t("nav.weather"),
      value: weatherValue
    },
    {
      id: "farms",
      label: t("status.location"),
      value: location || undefined
    },
    {
      id: "diagnosis",
      label: t("status.crop"),
      value: activeCrops.length > 0 ? activeCrops.map((c) => c.cropName).join(", ") : undefined
    },
    {
      id: "soil",
      label: t("nav.soilWater"),
      value: latestSoil?.testedOn
        ? t("status.soilTested", { date: new Date(latestSoil.testedOn).toLocaleDateString() })
        : latestSoil
          ? t("status.soilRecorded")
          : undefined
    },
    {
      id: "scanHistory",
      label: t("status.latestScan"),
      value: latestScan
        ? new Date(latestScan.createdAt).toLocaleDateString()
        : undefined
    }
  ];

  return (
    <section className="mt-4">
      <h2 className="sr-only">{t("status.title")}</h2>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-5">
        {tiles.map((tile) => {
          const accent = accentFor(tile.id);
          return (
            <li
              key={tile.id}
              className={`agri-card relative overflow-hidden px-3 py-2.5 ring-1 ${accent.ring}`}
            >
              <span
                aria-hidden="true"
                className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${accent.wash}`}
              />
              <span className="relative block truncate text-[10px] font-semibold uppercase tracking-wide text-agri-forest/55">
                {tile.label}
              </span>
              {/* The value wraps rather than truncates. A single clipped
                  line dropped the end of "Coimbatore, Tamil Nadu" on a
                  phone and cut the tested-on date out of the Tamil and
                  Telugu soil strings entirely — and the date is the
                  whole point of that tile. A title attribute is no
                  answer on a touch screen, where there is no hover. */}
              <span
                className={`relative mt-0.5 block break-words text-sm font-semibold ${
                  tile.value ? "text-agri-forest" : "text-gray-400"
                }`}
                title={tile.value ?? undefined}
              >
                {/* null = still loading, undefined = nothing recorded.
                    They read differently to a farmer and must not be
                    collapsed into one another. */}
                {tile.value === null
                  ? t("common.loading")
                  : (tile.value ?? t("status.none"))}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
