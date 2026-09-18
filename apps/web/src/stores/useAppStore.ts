import { create } from "zustand";
import type { SupportedLanguage } from "@agri-one/shared-types";

interface AppState {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => void;
  activeFarmId: string | null;
  setActiveFarmId: (id: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  language: "en",
  setLanguage: (language) => set({ language }),
  activeFarmId: null,
  setActiveFarmId: (activeFarmId) => set({ activeFarmId })
}));
