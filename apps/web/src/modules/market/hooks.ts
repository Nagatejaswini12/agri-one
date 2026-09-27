import { useQuery } from "@tanstack/react-query";
import type { DataResult, Farm, MarketSnapshot } from "@agri-one/shared-types";
import { callMarketApi } from "@/lib/marketClient";
import { normalizeMarketResult } from "@/modules/market/normalize";
import { useAuth } from "@/auth/AuthProvider";
import { useAppStore } from "@/stores/useAppStore";

const MARKET_KEY = "market";

/**
 * AGMARKNET publishes one snapshot per day, so re-asking within a visit
 * can only return the same rows.
 */
const STALE_TIME_MS = 30 * 60 * 1000;

/**
 * Reads the latest mandi prices for one crop in the farm's own district.
 *
 * The agent is only called when the farm actually has a state and
 * district saved and a crop is selected — a farm without a district
 * renders an empty state instead, since substituting a nearby district
 * would mean showing another market's prices as if they were this
 * farmer's.
 *
 * Nothing is persisted: prices are read live on each view (see
 * docs/architecture.md), so there is no Supabase table behind this.
 *
 * The prices now come from this project's own /api/market, which calls
 * the same official AGMARKNET resource on data.gov.in that the n8n
 * workflow called. Market therefore keeps working with real official
 * data while n8n Cloud is out of executions. The request payload, the
 * DataResult contract and every state this hook can return are
 * unchanged, so the page did not need redesigning.
 */
export function useMarket(farm: Farm | undefined, commodity: string | null) {
  const { status } = useAuth();
  const language = useAppStore((s) => s.language);

  const state = farm?.state ?? null;
  const district = farm?.district ?? null;
  const hasLocation = state !== null && district !== null;
  const crop = commodity && commodity.trim().length > 0 ? commodity.trim() : null;

  return useQuery({
    queryKey: [MARKET_KEY, farm?.id, state, district, crop, language],
    enabled: status === "signed-in" && !!farm && hasLocation && crop !== null,
    staleTime: STALE_TIME_MS,
    queryFn: async (): Promise<DataResult<MarketSnapshot>> =>
      normalizeMarketResult(
        await callMarketApi<unknown>({
          state,
          district,
          commodity: crop,
          locale: language
        })
      )
  });
}
