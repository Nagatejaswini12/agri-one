import { useQuery } from "@tanstack/react-query";
import type { DataResult, Farm, FarmCrop, SchemeMatchResult } from "@agri-one/shared-types";
import { callAgentWebhook } from "@/lib/n8nClient";
import { normalizeSchemesResult } from "@/modules/schemes/normalize";
import { useAuth } from "@/auth/AuthProvider";
import { useAppStore } from "@/stores/useAppStore";

const SCHEMES_KEY = "schemes";

/**
 * The catalog is human-curated and changes on the order of months, so
 * re-asking within a session can only return the same entries.
 */
const STALE_TIME_MS = 60 * 60 * 1000;

/**
 * Reads the curated government-scheme catalog matched against one farm.
 *
 * Unlike Weather and Market, this runs even when the farm has no saved
 * state: central schemes apply nationwide, so there is still something
 * true to show. What it must not do is pretend the state-specific ones
 * were evaluated — the agent returns `stateSchemesSkipped` for exactly
 * that, and the page says so.
 *
 * Nothing is persisted: this is a read-only discovery list, so there is
 * no Supabase table and no migration behind it.
 */
export function useSchemes(farm: Farm | undefined, crops: FarmCrop[] | undefined) {
  const { status } = useAuth();
  const language = useAppStore((s) => s.language);

  const state = farm?.state ?? null;
  const district = farm?.district ?? null;
  const areaAcres = farm?.areaAcres ?? null;
  const cropNames = (crops ?? []).map((c) => c.cropName).filter((n) => n.trim().length > 0);

  return useQuery({
    queryKey: [SCHEMES_KEY, farm?.id, state, district, areaAcres, cropNames.join("|"), language],
    enabled: status === "signed-in" && !!farm,
    staleTime: STALE_TIME_MS,
    queryFn: async (): Promise<DataResult<SchemeMatchResult>> =>
      normalizeSchemesResult(
        await callAgentWebhook<unknown>("schemes", {
          state,
          district,
          areaAcres,
          crops: cropNames,
          locale: language
        })
      )
  });
}
