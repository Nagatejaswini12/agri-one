import { useMutation } from "@tanstack/react-query";
import type {
  ChatAnswer,
  DataResult,
  Farm,
  FarmCrop,
  Scan,
  SoilRecord
} from "@agri-one/shared-types";
import { callAgentWebhook } from "@/lib/n8nClient";
import { normalizeChatResult } from "@/modules/voice-ai/normalize";
import { useAppStore } from "@/stores/useAppStore";

const SCAN_WINDOW_DAYS = 30;
const MAX_SCANS = 5;

/**
 * What the assistant is allowed to know about a recent scan.
 *
 * No disease label, no alternatives, no disclaimer text. `diagnosis.recent`
 * may restate that the Crop Diagnosis Agent asked for an expert, or that
 * a scan was inconclusive — nothing more. Because the label never leaves
 * the browser, "turn a diagnosis into a treatment" is impossible rather
 * than merely forbidden.
 */
interface ChatScan {
  scanId: string;
  cropName: string | null;
  createdAt: string;
  category: string | null;
  confidenceLevel: string | null;
  recommendExpertConsult: boolean;
}

/**
 * The farmer's own recorded soil values, so `soil.status` can report
 * them back as facts.
 *
 * Reporting a record is allowed; interpreting it is not. No rule in
 * Chat - Core branches on whether a nutrient reading is high or low, and
 * no answer template turns one into a fertiliser recommendation — that
 * line is what separates "here is what you recorded" from agronomic
 * advice this system is not qualified to give.
 */
interface ChatSoil {
  soilType: string | null;
  ph: number | null;
  nitrogen: number | null;
  phosphorus: number | null;
  potassium: number | null;
  organicCarbon: number | null;
  testedOn: string | null;
}

function projectScans(scans: Scan[] | undefined, crops: FarmCrop[] | undefined): ChatScan[] {
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

/** A value the farmer never recorded stays null and is never substituted. */
function projectSoil(records: SoilRecord[] | undefined): ChatSoil | null {
  const latest = records?.[0];
  if (!latest) return null;
  return {
    soilType: latest.soilType,
    ph: latest.ph,
    nitrogen: latest.nitrogen,
    phosphorus: latest.phosphorus,
    potassium: latest.potassium,
    organicCarbon: latest.organicCarbon,
    testedOn: latest.testedOn
  };
}

export interface AskInput {
  text: string;
  farm: Farm | undefined;
  crops: FarmCrop[] | undefined;
  soilRecords: SoilRecord[] | undefined;
  scans: Scan[] | undefined;
  primaryCrop: string | null;
}

/**
 * Sends a question to the assistant with the farm context the frontend
 * already holds. n8n reads no Supabase table — every query behind these
 * inputs ran here, under the farmer's own row-level security.
 *
 * Nothing is persisted: chat history is session-only React state, so
 * there is no table and no migration behind it.
 */
export function useAskChat() {
  const language = useAppStore((s) => s.language);

  return useMutation({
    mutationFn: async (input: AskInput): Promise<DataResult<ChatAnswer>> => {
      const cropNames = (input.crops ?? [])
        .map((c) => c.cropName)
        .filter((n) => n.trim().length > 0);

      return normalizeChatResult(
        await callAgentWebhook<unknown>("chat", {
          text: input.text,
          farmId: input.farm?.id ?? null,
          state: input.farm?.state ?? null,
          district: input.farm?.district ?? null,
          latitude: input.farm?.latitude ?? null,
          longitude: input.farm?.longitude ?? null,
          areaAcres: input.farm?.areaAcres ?? null,
          crops: cropNames,
          primaryCrop: input.primaryCrop ?? cropNames[0] ?? null,
          latestSoil: projectSoil(input.soilRecords),
          recentScans: projectScans(input.scans, input.crops),
          locale: language
        })
      );
    }
  });
}
