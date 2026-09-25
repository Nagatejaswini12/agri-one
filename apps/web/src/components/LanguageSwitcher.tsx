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
      // Awaited on purpose. Supabase is the source of truth for the
      // farmer's language, and on the next full load the app reads it
      // back. Firing this off unawaited left a window where a reload —
      // or the PWA relaunching — read the OLD preference and switched
      // the farmer back to a language they had just left. A failed write
      // must not undo the switch they can already see, so the error is
      // swallowed: the local switch stands and the next successful
      // change will persist it.
      await updatePreferredLanguage.mutateAsync(lang).catch(() => {});
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
        className="shrink-0 rounded border px-2 py-1 text-sm"
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
