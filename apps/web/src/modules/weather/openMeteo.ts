import type {
  DataResult,
  WeatherAdvisoryFlag,
  WeatherForecastDay,
  WeatherSnapshot
} from "@agri-one/shared-types";

/**
 * Open-Meteo's forecast response, mapped into the WeatherSnapshot
 * contract.
 *
 * This is a direct port of the mapping the n8n Weather workflow did,
 * thresholds included, so moving the call off n8n changes where the
 * request is made and nothing about what a farmer is told. The n8n
 * workflow is left in place and untouched.
 *
 * Every number is passed through exactly as the source reported it —
 * nothing is smoothed, rounded or filled in, and a value the source
 * omitted becomes null rather than a plausible-looking guess.
 *
 * Conditions stay as numeric WMO codes on purpose: the frontend maps
 * them to translated labels, so a Tamil, Telugu or Hindi farmer reads
 * the condition in their own language rather than English pasted in
 * from here.
 *
 * Pure. It performs no I/O, which is what makes it testable against
 * recorded responses without reaching the network.
 */

export const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";

const SOURCE = "open-meteo";
const THUNDERSTORM_CODES = [95, 96, 99];

// Thresholds for the advisory flags, identical to the workflow's. These
// are statements of what the forecast says, never recommendations — no
// treatment, chemical or dosage guidance is produced anywhere here.
const RAIN_TODAY_PROBABILITY_PCT = 60;
const HEAVY_RAIN_PROBABILITY_PCT = 70;
const HEAVY_RAIN_SUM_MM = 10;
const HIGH_WIND_KPH = 30;
const EXTREME_HEAT_C = 40;
const DRY_DAY_SUM_MM = 1;

/** The exact query the workflow sent, so the response shape is the same. */
export function openMeteoQuery(latitude: number, longitude: number): URLSearchParams {
  return new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: "temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m",
    daily:
      "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max",
    forecast_days: "3",
    timezone: "auto"
  });
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function at(arr: unknown, i: number): number | null {
  return Array.isArray(arr) ? num(arr[i]) : null;
}

export function mapOpenMeteo(body: unknown, now: () => Date = () => new Date()): DataResult<WeatherSnapshot> {
  if (!isRecord(body)) {
    return { status: "unavailable", reason: "The weather service returned an unreadable response." };
  }

  const current = isRecord(body.current) ? body.current : {};
  const daily = isRecord(body.daily) ? body.daily : {};
  const days = Array.isArray(daily.time) ? daily.time : [];

  const forecast: WeatherForecastDay[] = [];
  for (let i = 0; i < days.length && i < 3; i++) {
    if (typeof days[i] !== "string") continue;
    forecast.push({
      date: days[i] as string,
      weatherCode: at(daily.weather_code, i),
      temperatureMaxC: at(daily.temperature_2m_max, i),
      temperatureMinC: at(daily.temperature_2m_min, i),
      precipitationSumMm: at(daily.precipitation_sum, i),
      precipitationProbabilityMaxPct: at(daily.precipitation_probability_max, i)
    });
  }

  const observedAt = typeof current.time === "string" ? current.time : null;

  // A 200 with nothing usable in it is still no weather data. Say so
  // rather than render an empty card as though it were a reading.
  if (!observedAt && forecast.length === 0) {
    return {
      status: "unavailable",
      reason: "The weather service returned no data for this location."
    };
  }

  const advisories: WeatherAdvisoryFlag[] = [];
  const currentCode = num(current.weather_code);
  const currentWind = num(current.wind_speed_10m);

  const todayProbability = forecast.length > 0 ? forecast[0].precipitationProbabilityMaxPct : null;
  if (todayProbability !== null && todayProbability >= RAIN_TODAY_PROBABILITY_PCT) {
    advisories.push("rain_expected_today");
  }

  let heavyRain = false;
  let thunderstorm = currentCode !== null && THUNDERSTORM_CODES.includes(currentCode);
  let extremeHeat = false;
  // Only claim a dry spell when every day actually reported a figure.
  let dryRun = forecast.length > 0;

  for (const day of forecast) {
    if (
      day.precipitationProbabilityMaxPct !== null &&
      day.precipitationProbabilityMaxPct >= HEAVY_RAIN_PROBABILITY_PCT &&
      day.precipitationSumMm !== null &&
      day.precipitationSumMm >= HEAVY_RAIN_SUM_MM
    ) {
      heavyRain = true;
    }
    if (day.weatherCode !== null && THUNDERSTORM_CODES.includes(day.weatherCode)) thunderstorm = true;
    if (day.temperatureMaxC !== null && day.temperatureMaxC >= EXTREME_HEAT_C) extremeHeat = true;
    if (!(day.precipitationSumMm !== null && day.precipitationSumMm < DRY_DAY_SUM_MM)) dryRun = false;
  }

  if (heavyRain) advisories.push("heavy_rain_expected");
  if (thunderstorm) advisories.push("thunderstorm_expected");
  if (currentWind !== null && currentWind >= HIGH_WIND_KPH) advisories.push("high_wind");
  if (extremeHeat) advisories.push("extreme_heat");
  if (dryRun) advisories.push("no_rain_next_3_days");

  return {
    status: "ok",
    asOf: now().toISOString(),
    source: SOURCE,
    data: {
      latitude: num(body.latitude),
      longitude: num(body.longitude),
      timezone: typeof body.timezone === "string" ? body.timezone : null,
      current: {
        observedAt,
        temperatureC: num(current.temperature_2m),
        relativeHumidityPct: num(current.relative_humidity_2m),
        precipitationMm: num(current.precipitation),
        windSpeedKph: currentWind,
        weatherCode: currentCode
      },
      forecast,
      advisories
    }
  };
}

/**
 * Coordinates a farm may or may not have. A farm without a location is
 * not given someone else's weather, so anything unusable is rejected
 * here rather than sent to the provider.
 */
export function parseCoordinates(
  latitude: unknown,
  longitude: unknown
): { latitude: number; longitude: number } | null {
  const lat = num(latitude);
  const lon = num(longitude);
  if (lat === null || lon === null) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { latitude: lat, longitude: lon };
}
