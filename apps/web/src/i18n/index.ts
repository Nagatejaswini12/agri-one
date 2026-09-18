import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import type { SupportedLanguage } from "@agri-one/shared-types";

export const SUPPORTED_LANGUAGES: { code: SupportedLanguage; label: string }[] = [
  { code: "en", label: "English" },
  { code: "ta", label: "தமிழ்" },
  { code: "te", label: "తెలుగు" },
  { code: "hi", label: "हिन्दी" }
];

// Adding a new Indian language later = add its code above and drop
// public/locales/<code>/common.json — no other code changes needed.
// Bundles are fetched lazily per-language via loadLanguage() below, so
// i18n starts with no resources; main.tsx calls loadLanguage("en") on boot.
void i18n
  .use(initReactI18next)
  .init({
    lng: "en",
    fallbackLng: "en",
    defaultNS: "common",
    interpolation: { escapeValue: false }
  });

export async function loadLanguage(lang: SupportedLanguage) {
  if (!i18n.hasResourceBundle(lang, "common")) {
    const res = await fetch(`/locales/${lang}/common.json`);
    const bundle = await res.json();
    i18n.addResourceBundle(lang, "common", bundle);
  }
  await i18n.changeLanguage(lang);
}

export default i18n;
