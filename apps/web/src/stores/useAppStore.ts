import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SupportedLanguage } from "@agri-one/shared-types";

interface AppState {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => void;
  activeFarmId: string | null;
  setActiveFarmId: (id: string | null) => void;
}

// Persisted to localStorage as a per-device convenience (last-used
// language/farm before Supabase data has loaded). Once signed in, the
// farmer's Supabase profile (preferred_language) is the source of truth
// — see LanguageSwitcher.
export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      language: "en",
      setLanguage: (language) => set({ language }),
      activeFarmId: null,
      setActiveFarmId: (activeFarmId) => set({ activeFarmId })
    }),
    { name: "agri-one-app-store" }
  )
);
