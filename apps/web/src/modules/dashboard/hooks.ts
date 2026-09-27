import { useQuery } from "@tanstack/react-query";
import type {
  DataResult,
  Farm,
  FarmBriefing,
  FarmCrop,
  Scan,
  SoilRecord
} from "@agri-one/shared-types";
import { callOrchestratorApi } from "@/lib/orchestratorClient";
import { normalizeBriefingResult } from "@/modules/dashboard/normalize";
import { useAuth } from "@/auth/AuthProvider";
import { useAppStore } from "@/stores/useAppStore";

const BRIEFING_KEY = "briefing";

/** Weather moves fastest of the inputs, and it is a forecast, not a reading. */
const STALE_TIME_MS = 15 * 60 * 1000;

const SCAN_WINDOW_DAYS = 30;
const MAX_SCANS = 5;

/**
 * What the Orchestrator is allowed to know about a recent scan.
 *
 * Deliberately excludes the disease label, the alternatives and the
 * disclaimer text. The decision rules may only restate that the
 * diagnosis agent asked for an expert, or that it was inconclusive —
 * and because the label never leaves the browser, "turn a diagnosis into
 * a treatment" is impossible rather than merely forbidden.
 */
interface BriefingScan {
  scanId: string;
  cropName: string | null;
  createdAt: string;
  category: string | null;
  confidenceLevel: string | null;
  recommendExpertConsult: boolean;
}

function projectScans(scans: Scan[] | undefined, crops: FarmCrop[] | undefined): BriefingScan[] {
  if (!scans || scans.length === 0) return [];
  const cutoff = Date.now() - SCAN_WINDOW_DAYS * 86400000;
  return scans
    .filter((s) => {
      const t = Date.parse(s.createdAt);
      return Number.isFinite(t) && t >= cutoff;
    })
    .slice(0, MAX_SCANS)
    .map((s) => ({
      scanId: s.id,
      cropName: crops?.find((c) => c.id === s.cropId)?.cropName ?? null,
      createdAt: s.createdAt,
      category: s.diagnosisResult?.primaryFinding.category ?? null,
      confidenceLevel: s.diagnosisResult?.confidenceLevel ?? null,
      recommendExpertConsult: s.diagnosisResult?.recommendExpertConsult === true
    }));
}

/**
 * Presence and age of the latest soil test — nothing else.
 *
 * NPK and pH stay in the browser on purpose: no decision rule is
 * permitted to read soil chemistry, and not sending it makes that
 * structural. Widening this is a deliberate contract change, not an
 * accident.
 */
function projectSoil(records: SoilRecord[] | undefined): { testedOn: string } | null {
  const latest = records?.find((r) => r.testedOn !== null);
  return latest?.testedOn ? { testedOn: latest.testedOn } : null;
}

/**
 * Builds the farm briefing from the agents, sending the farm context the
 * frontend already holds. n8n reads no Supabase table for this feature —
 * every query behind these inputs ran here, under the farmer's own
 * row-level security.
 *
 * Nothing is persisted: the briefing is recomputed per view, so there is
 * no table and no migration behind it.
 *
 * The briefing now comes from this project's own /api/orchestrator,
 * which calls the already-migrated Weather, Market and Schemes logic as
 * functions in one process rather than fanning out to n8n
 * sub-workflows. The request payload, the DataResult contract and every
 * state this hook can return are unchanged, so the card did not need
 * redesigning — and the two projections below still decide what the
 * Orchestrator is allowed to know.
 */
export function useBriefing(
  farm: Farm | undefined,
  crops: FarmCrop[] | undefined,
  soilRecords: SoilRecord[] | undefined,
  scans: Scan[] | undefined,
  primaryCrop: string | null
) {
  const { status } = useAuth();
  const language = useAppStore((s) => s.language);

  const recentScans = projectScans(scans, crops);
  const latestSoil = projectSoil(soilRecords);
  const cropNames = (crops ?? []).map((c) => c.cropName).filter((n) => n.trim().length > 0);

  return useQuery({
    queryKey: [
      BRIEFING_KEY,
      farm?.id,
      primaryCrop,
      cropNames.join("|"),
      latestSoil?.testedOn ?? null,
      recentScans.length,
      language
    ],
    enabled: status === "signed-in" && !!farm,
    staleTime: STALE_TIME_MS,
    queryFn: async (): Promise<DataResult<FarmBriefing>> =>
      normalizeBriefingResult(
        await callOrchestratorApi<unknown>({
          farmId: farm?.id ?? null,
          state: farm?.state ?? null,
          district: farm?.district ?? null,
          latitude: farm?.latitude ?? null,
          longitude: farm?.longitude ?? null,
          areaAcres: farm?.areaAcres ?? null,
          crops: cropNames,
          primaryCrop,
          latestSoil,
          recentScans,
          locale: language
        })
      )
  });
}
