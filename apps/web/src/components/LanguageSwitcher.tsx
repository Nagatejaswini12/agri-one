import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES, loadLanguage } from "@/i18n";
import { useAppStore } from "@/stores/useAppStore";
import { useAuth } from "@/auth/AuthProvider";
import { useUpdatePreferredLanguage } from "@/modules/profile/hooks";

/**
 * Reused on the auth pages (pre-login) and in the app header (post-login).
 * When signed in, a change also persists to farmers.preferred_language —
 * Supabase is the source of truth once a farmer has an account; local
 * state/localStorage is only what drives the UI before/without a session.
 */
export function LanguageSwitcher() {
  const { t } = useTranslation();
  const language = useAppStore((s) => s.language);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const { status } = useAuth();
  const updatePreferredLanguage = useUpdatePreferredLanguage();

  async function handleChange(lang: (typeof SUPPORTED_LANGUAGES)[number]["code"]) {
    setLanguage(lang);
    await loadLanguage(lang);
    if (status === "signed-in") {
      updatePreferredLanguage.mutate(lang);
    }
  }

  return (
    <>
      <label className="sr-only" htmlFor="language-select">
        {t("common.selectLanguage")}
      </label>
      <select
        id="language-select"
        value={language}
        onChange={(e) => void handleChange(e.target.value as (typeof SUPPORTED_LANGUAGES)[number]["code"])}
        className="rounded border px-2 py-1 text-sm"
      >
        {SUPPORTED_LANGUAGES.map(({ code, label }) => (
          <option key={code} value={code}>
            {label}
          </option>
        ))}
      </select>
    </>
  );
}
