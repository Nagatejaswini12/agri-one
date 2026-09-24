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
    interpolation: { escapeValue: false },
    react: {
      // Re-render when a bundle is ADDED, not only when the language
      // changes. loadLanguage() ends with changeLanguage(), which emits
      // nothing when the language is already current -- so without this
      // a late-arriving bundle can leave already-mounted components
      // showing raw keys. The first paint is protected separately, by
      // main.tsx awaiting the bundle before it renders at all; this
      // covers the later loads, such as the one the profile triggers
      // when a farmer's saved language differs from this device's.
      bindI18nStore: "added"
    }
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
