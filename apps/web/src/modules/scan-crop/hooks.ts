import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CropDiagnosisResult, DataResult, Scan } from "@agri-one/shared-types";
import { supabase } from "@/lib/supabaseClient";
import { uploadCropScanImage } from "@/lib/storage";
import { callAgentWebhook } from "@/lib/n8nClient";
import { normalizeDiagnosisResult } from "@/modules/scan-crop/normalize";
import { mapScanRow, type ScanRow } from "@/lib/mappers";
import { useAuth } from "@/auth/AuthProvider";
import { useAppStore } from "@/stores/useAppStore";

const SCANS_KEY = "scans";

export function useScans(farmId: string | undefined) {
  const { status } = useAuth();
  return useQuery({
    queryKey: [SCANS_KEY, farmId],
    enabled: status === "signed-in" && !!farmId,
    queryFn: async (): Promise<Scan[]> => {
      if (!supabase || !farmId) return [];
      const { data, error } = await supabase
        .from("scans")
        .select("*")
        .eq("farm_id", farmId)
        .order("created_at", { ascending: false })
        .returns<ScanRow[]>();
      if (error) throw error;
      return data.map(mapScanRow);
    }
  });
}

export interface DiagnoseCropInput {
  farmId: string;
  cropId: string;
  cropName: string | null;
  file: File;
}

export interface DiagnoseCropOutcome {
  result: DataResult<CropDiagnosisResult>;
  /**
   * True when the diagnosis itself succeeded but writing the Scan row to
   * history didn't. Kept separate so a history failure never discards a
   * real result the farmer is waiting on.
   */
  historySaveFailed: boolean;
}

/**
 * Uploads the photo, calls the Crop Diagnosis Agent, and — matching this
 * app's two-tier architecture (frontend persists agent interactions
 * directly to Supabase, n8n never holds a Storage/DB credential for this
 * feature) — writes the resulting Scan row itself. A failed diagnosis
 * still returns the DataResult "unavailable" shape rather than throwing,
 * so the caller can render it like any other live-data failure; nothing
 * is persisted in that case.
 *
 * The webhook is the production "Crop Diagnosis API" workflow
 * (POST /webhook/crop-diagnosis), which takes imageUrl/cropName/locale and
 * delegates to "Crop Diagnosis - Core". imageUrl is a short-lived signed
 * Storage URL so n8n can fetch the bytes without holding a Storage
 * credential of its own.
 */
export function useDiagnoseCrop() {
  const { user } = useAuth();
  const language = useAppStore((s) => s.language);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      farmId,
      cropId,
      cropName,
      file
    }: DiagnoseCropInput): Promise<DiagnoseCropOutcome> => {
      if (!supabase || !user) throw new Error("Not signed in.");

      const { storagePath, signedUrl } = await uploadCropScanImage(user.id, farmId, file);

      const result = normalizeDiagnosisResult(
        await callAgentWebhook<unknown>("crop-diagnosis", {
          imageUrl: signedUrl,
          cropName,
          locale: language
        })
      );

      if (result.status !== "ok") return { result, historySaveFailed: false };

      // A diagnosis the farmer can act on is worth more than its history
      // row, so a failed insert is reported alongside the result instead
      // of throwing it away.
      const { error } = await supabase.from("scans").insert({
        farm_id: farmId,
        crop_id: cropId,
        image_url: storagePath,
        diagnosis_result: result.data,
        confidence: result.data.primaryFinding.confidence
      });

      return { result, historySaveFailed: !!error };
    },
    onSuccess: ({ result, historySaveFailed }, { farmId }) => {
      if (result.status === "ok" && !historySaveFailed) {
        void queryClient.invalidateQueries({ queryKey: [SCANS_KEY, farmId] });
      }
    }
  });
}
