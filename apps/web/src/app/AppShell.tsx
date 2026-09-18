import { NavLink, Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAppStore } from "@/stores/useAppStore";
import { SUPPORTED_LANGUAGES, loadLanguage } from "@/i18n";

// Mirrors the report's PLAN → GROW → PROTECT → SELL journey. Home and More
// sit outside that journey; Voice AI is reachable from anywhere via the
// floating mic button rather than competing for a nav slot.
const STAGE_NAV_ITEMS: { to: string; key: string }[] = [
  { to: "/", key: "nav.dashboard" },
  { to: "/plan", key: "nav.plan" },
  { to: "/grow", key: "nav.grow" },
  { to: "/protect", key: "nav.protect" },
  { to: "/sell", key: "nav.sell" }
];

export function AppShell() {
  const { t } = useTranslation();
  const language = useAppStore((s) => s.language);
  const setLanguage = useAppStore((s) => s.setLanguage);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="flex items-center justify-between border-b bg-white px-4 py-3">
        <span className="text-lg font-bold text-green-800">{t("appName")}</span>
        <div className="flex items-center gap-3">
          <NavLink to="/more" className="text-sm font-medium text-gray-600">
            {t("nav.more")}
          </NavLink>
          <label className="sr-only" htmlFor="language-select">
            {t("common.selectLanguage")}
          </label>
          <select
            id="language-select"
            value={language}
            onChange={(e) => {
              const lang = e.target.value as typeof language;
              setLanguage(lang);
              void loadLanguage(lang);
            }}
            className="rounded border px-2 py-1 text-sm"
          >
            {SUPPORTED_LANGUAGES.map(({ code, label }) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </header>

      <main className="pb-20">
        <Outlet />
      </main>

      <NavLink
        to="/voice-ai"
        aria-label={t("nav.voiceAi")}
        className="fixed bottom-20 right-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-700 text-2xl text-white shadow-lg"
      >
        🎙️
      </NavLink>

      <nav className="fixed bottom-0 left-0 right-0 flex border-t bg-white">
        {STAGE_NAV_ITEMS.map(({ to, key }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `flex-1 py-2 text-center text-xs ${isActive ? "font-semibold text-green-700" : "text-gray-500"}`
            }
          >
            {t(key)}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
