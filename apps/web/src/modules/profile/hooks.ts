import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Farmer, SupportedLanguage } from "@agri-one/shared-types";
import { supabase } from "@/lib/supabaseClient";
import { mapFarmerRow, type FarmerRow } from "@/lib/mappers";
import { useAuth } from "@/auth/AuthProvider";
import { useAppStore } from "@/stores/useAppStore";
import { loadLanguage } from "@/i18n";

const FARMER_PROFILE_KEY = "farmer-profile";

export function useFarmerProfile() {
  const { status, user } = useAuth();

  return useQuery({
    queryKey: [FARMER_PROFILE_KEY, user?.id],
    enabled: status === "signed-in" && !!user,
    queryFn: async (): Promise<Farmer | null> => {
      if (!supabase || !user) return null;
      const { data, error } = await supabase
        .from("farmers")
        .select("*")
        .eq("id", user.id)
        .maybeSingle<FarmerRow>();
      if (error) throw error;
      return data ? mapFarmerRow(data) : null;
    }
  });
}

/** Syncs the app's active i18n language to the farmer's saved preference once the profile loads. */
export function useSyncLanguageFromProfile(profile: Farmer | null | undefined) {
  const setLanguage = useAppStore((s) => s.setLanguage);
  const currentLanguage = useAppStore((s) => s.language);

  useEffect(() => {
    if (profile && profile.preferredLanguage !== currentLanguage) {
      setLanguage(profile.preferredLanguage);
      void loadLanguage(profile.preferredLanguage);
    }
    // Only re-sync when the profile's saved language actually changes —
    // currentLanguage is intentionally excluded so a local switch (which
    // also updates the profile) doesn't immediately fight itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.preferredLanguage]);
}

export function useUpdatePreferredLanguage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (language: SupportedLanguage) => {
      if (!supabase || !user) throw new Error("Not signed in.");
      const { error } = await supabase
        .from("farmers")
        .update({ preferred_language: language })
        .eq("id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [FARMER_PROFILE_KEY] });
    }
  });
}

export interface ProfileEditableFields {
  name: string | null;
  phone: string | null;
}

export function useUpdateFarmerProfile() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (fields: ProfileEditableFields) => {
      if (!supabase || !user) throw new Error("Not signed in.");
      const { error } = await supabase
        .from("farmers")
        .update({ name: fields.name, phone: fields.phone })
        .eq("id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [FARMER_PROFILE_KEY] });
    }
  });
}
