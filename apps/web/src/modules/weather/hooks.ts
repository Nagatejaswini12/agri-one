import { useQuery } from "@tanstack/react-query";
import type { Farm, WeatherSnapshot, DataResult } from "@agri-one/shared-types";
import { callWeatherApi } from "@/lib/weatherClient";
import { normalizeWeatherResult } from "@/modules/weather/normalize";
import { useAuth } from "@/auth/AuthProvider";
import { useAppStore } from "@/stores/useAppStore";

const WEATHER_KEY = "weather";

/** Live readings go stale quickly, but not within a single page visit. */
const STALE_TIME_MS = 10 * 60 * 1000;

/**
 * Reads live weather for one farm's own coordinates. The agent is only
 * called when the farm actually has a location — a farm without
 * latitude/longitude renders an empty state instead, since guessing a
 * location would mean showing another place's weather as if it were
 * this farm's.
 *
 * Nothing is persisted: weather is read live on each view (see
 * docs/architecture.md), so there is no Supabase table behind this.
 *
 * The reading now comes from this project's own /api/weather, which
 * calls Open-Meteo directly. Weather therefore keeps working with real
 * live data while n8n Cloud is out of executions. The request payload,
 * the DataResult contract and every state this hook can return are
 * unchanged, so the page did not need redesigning.
 */
export function useWeather(farm: Farm | undefined) {
  const { status } = useAuth();
  const language = useAppStore((s) => s.language);

  const latitude = farm?.latitude ?? null;
  const longitude = farm?.longitude ?? null;
  const hasCoordinates = latitude !== null && longitude !== null;

  return useQuery({
    queryKey: [WEATHER_KEY, farm?.id, latitude, longitude, language],
    enabled: status === "signed-in" && !!farm && hasCoordinates,
    staleTime: STALE_TIME_MS,
    queryFn: async (): Promise<DataResult<WeatherSnapshot>> =>
      normalizeWeatherResult(
        await callWeatherApi<unknown>({
          latitude,
          longitude,
          locale: language
        })
      )
  });
}
