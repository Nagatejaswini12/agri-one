import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SoilRecord } from "@agri-one/shared-types";
import { supabase } from "@/lib/supabaseClient";
import { mapSoilRecordRow, type SoilRecordRow } from "@/lib/mappers";
import { useAuth } from "@/auth/AuthProvider";

const SOIL_RECORDS_KEY = "soil-records";

export function useSoilRecords(farmId: string | undefined) {
  const { status } = useAuth();
  return useQuery({
    queryKey: [SOIL_RECORDS_KEY, farmId],
    enabled: status === "signed-in" && !!farmId,
    queryFn: async (): Promise<SoilRecord[]> => {
      if (!supabase || !farmId) return [];
      const { data, error } = await supabase
        .from("soil_records")
        .select("*")
        .eq("farm_id", farmId)
        .order("created_at", { ascending: false })
        .returns<SoilRecordRow[]>();
      if (error) throw error;
      return data.map(mapSoilRecordRow);
    }
  });
}

export interface SoilRecordInput {
  soilType: string | null;
  nitrogen: number | null;
  phosphorus: number | null;
  potassium: number | null;
  ph: number | null;
  organicCarbon: number | null;
  testedOn: string | null;
}

export function useCreateSoilRecord(farmId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SoilRecordInput) => {
      if (!supabase) throw new Error("Not signed in.");
      const { error } = await supabase.from("soil_records").insert({
        farm_id: farmId,
        source: "manual",
        soil_type: input.soilType,
        nitrogen: input.nitrogen,
        phosphorus: input.phosphorus,
        potassium: input.potassium,
        ph: input.ph,
        organic_carbon: input.organicCarbon,
        tested_on: input.testedOn
      });
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: [SOIL_RECORDS_KEY, farmId] })
  });
}
