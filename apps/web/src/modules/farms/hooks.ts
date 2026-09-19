import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Farm, FarmCrop } from "@agri-one/shared-types";
import { supabase } from "@/lib/supabaseClient";
import { mapFarmRow, mapFarmCropRow, type FarmRow, type FarmCropRow } from "@/lib/mappers";
import { useAuth } from "@/auth/AuthProvider";

const FARMS_KEY = "farms";
const FARM_CROPS_KEY = "farm-crops";

export function useFarms() {
  const { status, user } = useAuth();
  return useQuery({
    queryKey: [FARMS_KEY, user?.id],
    enabled: status === "signed-in" && !!user,
    queryFn: async (): Promise<Farm[]> => {
      if (!supabase || !user) return [];
      const { data, error } = await supabase
        .from("farms")
        .select("*")
        .eq("farmer_id", user.id)
        .order("created_at", { ascending: true })
        .returns<FarmRow[]>();
      if (error) throw error;
      return data.map(mapFarmRow);
    }
  });
}

export function useFarm(farmId: string | undefined) {
  const { status } = useAuth();
  return useQuery({
    queryKey: [FARMS_KEY, "one", farmId],
    enabled: status === "signed-in" && !!farmId,
    queryFn: async (): Promise<Farm | null> => {
      if (!supabase || !farmId) return null;
      const { data, error } = await supabase
        .from("farms")
        .select("*")
        .eq("id", farmId)
        .maybeSingle<FarmRow>();
      if (error) throw error;
      return data ? mapFarmRow(data) : null;
    }
  });
}

export interface FarmInput {
  name: string;
  latitude: number | null;
  longitude: number | null;
  state: string | null;
  district: string | null;
  areaAcres: number | null;
}

export function useCreateFarm() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: FarmInput) => {
      if (!supabase || !user) throw new Error("Not signed in.");
      const { error } = await supabase.from("farms").insert({
        farmer_id: user.id,
        name: input.name,
        latitude: input.latitude,
        longitude: input.longitude,
        state: input.state,
        district: input.district,
        area_acres: input.areaAcres
      });
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: [FARMS_KEY] })
  });
}

export function useUpdateFarm() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: FarmInput }) => {
      if (!supabase) throw new Error("Not signed in.");
      const { error } = await supabase
        .from("farms")
        .update({
          name: input.name,
          latitude: input.latitude,
          longitude: input.longitude,
          state: input.state,
          district: input.district,
          area_acres: input.areaAcres
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: [FARMS_KEY] })
  });
}

export function useDeleteFarm() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!supabase) throw new Error("Not signed in.");
      const { error } = await supabase.from("farms").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: [FARMS_KEY] })
  });
}

export function useFarmCrops(farmId: string | undefined) {
  const { status } = useAuth();
  return useQuery({
    queryKey: [FARM_CROPS_KEY, farmId],
    enabled: status === "signed-in" && !!farmId,
    queryFn: async (): Promise<FarmCrop[]> => {
      if (!supabase || !farmId) return [];
      const { data, error } = await supabase
        .from("farm_crops")
        .select("*")
        .eq("farm_id", farmId)
        .order("created_at", { ascending: true })
        .returns<FarmCropRow[]>();
      if (error) throw error;
      return data.map(mapFarmCropRow);
    }
  });
}

export interface FarmCropInput {
  cropName: string;
  variety: string | null;
  sowingDate: string | null;
  currentStage: string | null;
}

export function useCreateFarmCrop(farmId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: FarmCropInput) => {
      if (!supabase) throw new Error("Not signed in.");
      const { error } = await supabase.from("farm_crops").insert({
        farm_id: farmId,
        crop_name: input.cropName,
        variety: input.variety,
        sowing_date: input.sowingDate,
        current_stage: input.currentStage
      });
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: [FARM_CROPS_KEY, farmId] })
  });
}

export function useDeleteFarmCrop(farmId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!supabase) throw new Error("Not signed in.");
      const { error } = await supabase.from("farm_crops").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: [FARM_CROPS_KEY, farmId] })
  });
}
