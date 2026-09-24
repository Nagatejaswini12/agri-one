import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FarmFinancialRecord, YieldRecord } from "@agri-one/shared-types";
import { supabase } from "@/lib/supabaseClient";
import {
  mapFarmFinancialRecordRow,
  mapYieldRecordRow,
  type FarmFinancialRecordRow,
  type YieldRecordRow
} from "@/lib/mappers";
import { useAuth } from "@/auth/AuthProvider";

/**
 * Reports reads and writes Supabase directly, like Soil & Water: every
 * value is the farmer's own entry, so there is no agent, no external
 * source and no n8n workflow behind this module.
 *
 * Row-level security scopes every query to farms the signed-in farmer
 * owns, so these hooks never filter by farmer themselves.
 */

const FINANCIAL_KEY = "financial-records";
const YIELD_KEY = "yield-records";

export function useFinancialRecords(farmId: string | undefined) {
  const { status } = useAuth();
  return useQuery({
    queryKey: [FINANCIAL_KEY, farmId],
    enabled: status === "signed-in" && !!farmId,
    queryFn: async (): Promise<FarmFinancialRecord[]> => {
      if (!supabase || !farmId) return [];
      const { data, error } = await supabase
        .from("farm_financial_records")
        .select("*")
        .eq("farm_id", farmId)
        .order("recorded_on", { ascending: false })
        .returns<FarmFinancialRecordRow[]>();
      if (error) throw error;
      return data.map(mapFarmFinancialRecordRow);
    }
  });
}

export function useYieldRecords(farmId: string | undefined) {
  const { status } = useAuth();
  return useQuery({
    queryKey: [YIELD_KEY, farmId],
    enabled: status === "signed-in" && !!farmId,
    queryFn: async (): Promise<YieldRecord[]> => {
      if (!supabase || !farmId) return [];
      const { data, error } = await supabase
        .from("yield_records")
        .select("*")
        .eq("farm_id", farmId)
        .order("harvested_on", { ascending: false })
        .returns<YieldRecordRow[]>();
      if (error) throw error;
      return data.map(mapYieldRecordRow);
    }
  });
}

export interface FinancialRecordInput {
  /** null for a farm-level entry that belongs to no single crop. */
  cropId: string | null;
  type: "cost" | "revenue";
  /** A stable key the UI translates, never display text. */
  category: string;
  amount: number;
  quantity: number | null;
  unit: string | null;
  recordedOn: string;
  notes: string | null;
}

export function useCreateFinancialRecord(farmId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: FinancialRecordInput) => {
      if (!supabase) throw new Error("Not signed in.");
      const { error } = await supabase.from("farm_financial_records").insert({
        farm_id: farmId,
        crop_id: input.cropId,
        type: input.type,
        category: input.category,
        amount: input.amount,
        quantity: input.quantity,
        unit: input.unit,
        recorded_on: input.recordedOn,
        notes: input.notes
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [FINANCIAL_KEY, farmId] })
  });
}

export function useDeleteFinancialRecord(farmId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!supabase) throw new Error("Not signed in.");
      const { error } = await supabase.from("farm_financial_records").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [FINANCIAL_KEY, farmId] })
  });
}

export interface YieldRecordInput {
  /** Required: a harvest quantity with no crop attached means nothing. */
  cropId: string;
  quantity: number;
  unit: string;
  harvestedOn: string;
}

export function useCreateYieldRecord(farmId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: YieldRecordInput) => {
      if (!supabase) throw new Error("Not signed in.");
      const { error } = await supabase.from("yield_records").insert({
        farm_id: farmId,
        crop_id: input.cropId,
        quantity: input.quantity,
        unit: input.unit,
        harvested_on: input.harvestedOn
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [YIELD_KEY, farmId] })
  });
}

export function useDeleteYieldRecord(farmId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!supabase) throw new Error("Not signed in.");
      const { error } = await supabase.from("yield_records").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [YIELD_KEY, farmId] })
  });
}
