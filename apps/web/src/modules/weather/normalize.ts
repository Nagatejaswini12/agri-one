import type {
  DataResult,
  WeatherAdvisoryFlag,
  WeatherCurrent,
  WeatherForecastDay,
  WeatherSnapshot
} from "@agri-one/shared-types";

/**
 * The Weather Agent runs in n8n, outside this codebase's type checking, so
 * a workflow edit can change its payload without the frontend knowing.
 * This coerces whatever actually arrives into `WeatherSnapshot` — a
 * missing reading becomes `null` and an unusable payload becomes
 * "unavailable", rather than crashing the page or rendering a stray
 * `undefined`.
 *
 * Nothing is invented here: no default temperatures, no filled-in
 * forecast days, no advisory the agent didn't send.
 */

const ADVISORY_FLAGS: readonly WeatherAdvisoryFlag[] = [
  "rain_expected_today",
  "heavy_rain_expected",
  "thunderstorm_expected",
  "high_wind",
  "extreme_heat",
  "no_rain_next_3_days"
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asCurrent(value: unknown): WeatherCurrent {
  const c = isRecord(value) ? value : {};
  return {
    observedAt: asString(c.observedAt),
    temperatureC: asNumber(c.temperatureC),
    relativeHumidityPct: asNumber(c.relativeHumidityPct),
    precipitationMm: asNumber(c.precipitationMm),
    windSpeedKph: asNumber(c.windSpeedKph),
    weatherCode: asNumber(c.weatherCode)
  };
}

/** A day without a date can't be labelled or ordered, so it's dropped. */
function asForecast(value: unknown): WeatherForecastDay[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const date = asString(item.date);
    if (!date) return [];
    return [
      {
        date,
        weatherCode: asNumber(item.weatherCode),
        temperatureMaxC: asNumber(item.temperatureMaxC),
        temperatureMinC: asNumber(item.temperatureMinC),
        precipitationSumMm: asNumber(item.precipitationSumMm),
        precipitationProbabilityMaxPct: asNumber(item.precipitationProbabilityMaxPct)
      }
    ];
  });
}

/** Unknown flags are dropped — the UI has no translation for them. */
function asAdvisories(value: unknown): WeatherAdvisoryFlag[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<WeatherAdvisoryFlag>();
  for (const item of value) {
    if (ADVISORY_FLAGS.includes(item as WeatherAdvisoryFlag)) seen.add(item as WeatherAdvisoryFlag);
  }
  return [...seen];
}

export function normalizeWeatherResult(
  result: DataResult<unknown>
): DataResult<WeatherSnapshot> {
  if (result.status === "unavailable") {
    if (asString(result.reason)) return result;
    return { status: "unavailable", reason: "The weather service is currently unavailable." };
  }

  const data = result.data;
  if (!isRecord(data)) {
    return { status: "unavailable", reason: "The weather service returned an unreadable response." };
  }

  const current = asCurrent(data.current);
  const forecast = asForecast(data.forecast);

  // Neither a current reading nor a single forecast day means there is
  // nothing to show — say so instead of rendering an empty card.
  if (current.observedAt === null && forecast.length === 0) {
    return { status: "unavailable", reason: "The weather service returned no readings for this location." };
  }

  return {
    status: "ok",
    asOf: asString(result.asOf) ?? new Date().toISOString(),
    source: asString(result.source) ?? "unknown",
    data: {
      latitude: asNumber(data.latitude),
      longitude: asNumber(data.longitude),
      timezone: asString(data.timezone),
      current,
      forecast,
      advisories: asAdvisories(data.advisories)
    }
  };
}
