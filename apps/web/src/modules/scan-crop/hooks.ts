import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CropDiagnosisResult, Scan } from "@agri-one/shared-types";
import { supabase } from "@/lib/supabaseClient";
import { uploadCropScanImage } from "@/lib/storage";
import { callAgentWebhook } from "@/lib/n8nClient";
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

/**
 * Uploads the photo, calls the Crop Diagnosis Agent, and — matching this
 * app's two-tier architecture (frontend persists agent interactions
 * directly to Supabase, n8n never holds a Storage/DB credential for this
 * feature) — writes the resulting Scan row itself. A failed diagnosis
 * still returns the DataResult "unavailable" shape rather than throwing,
 * so the caller can render it like any other live-data failure; nothing
 * is persisted in that case.
 */
export function useDiagnoseCrop() {
  const { user } = useAuth();
  const language = useAppStore((s) => s.language);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ farmId, cropId, cropName, file }: DiagnoseCropInput) => {
      if (!supabase || !user) throw new Error("Not signed in.");

      const { storagePath, signedUrl } = await uploadCropScanImage(user.id, farmId, file);

      const result = await callAgentWebhook<CropDiagnosisResult>("crop-diagnosis", {
        farmId,
        cropId,
        cropName,
        imageSignedUrl: signedUrl,
        locale: language
      });

      if (result.status === "ok") {
        const { error } = await supabase.from("scans").insert({
          farm_id: farmId,
          crop_id: cropId,
          image_url: storagePath,
          diagnosis_result: result.data,
          confidence: result.data.primaryFinding.confidence
        });
        if (error) throw error;
      }

      return result;
    },
    onSuccess: (result, { farmId }) => {
      if (result.status === "ok") {
        void queryClient.invalidateQueries({ queryKey: [SCANS_KEY, farmId] });
      }
    }
  });
}
