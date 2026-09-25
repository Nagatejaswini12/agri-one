import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { NavIcon } from "@/components/NavIcon";
import { AssistantButton } from "@/components/AssistantButton";
import { useFarmerProfile, useSyncLanguageFromProfile } from "@/modules/profile/hooks";

// Mirrors the report's PLAN → GROW → PROTECT → SELL journey. Home and More
// sit outside that journey; Voice AI is reachable from anywhere via the
// floating button rather than competing for a nav slot.
const STAGE_NAV_ITEMS: { to: string; key: string; icon: string }[] = [
  { to: "/", key: "nav.dashboard", icon: "dashboard" },
  { to: "/plan", key: "nav.plan", icon: "plan" },
  { to: "/grow", key: "nav.grow", icon: "grow" },
  { to: "/protect", key: "nav.protect", icon: "protect" },
  { to: "/sell", key: "nav.sell", icon: "sell" }
];

export function AppShell() {
  const { t } = useTranslation();
  const { data: profile } = useFarmerProfile();
  useSyncLanguageFromProfile(profile);
  // The floating button exists to reach the assistant from anywhere. On
  // the assistant's own page it does nothing except sit on top of the
  // send button — which on a phone makes the composer untappable.
  const onAssistantPage = useLocation().pathname === "/voice-ai";

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50/60 via-gray-50 to-gray-50">
      {/* The profile link shows the farmer's own name or email, and an
          email is long enough to push the language selector off the right
          edge of a phone — which made every screen in the app scroll
          sideways. The name truncates instead; the app title and the
          selector never shrink. */}
      <header className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-white/60 bg-white/80 px-4 py-3 backdrop-blur">
        <span className="shrink-0 text-lg font-bold text-green-800">{t("appName")}</span>
        <div className="flex min-w-0 items-center justify-end gap-3">
          <NavLink
            to="/profile"
            className="min-w-0 truncate text-sm font-medium text-gray-600"
            title={profile?.name || profile?.email || undefined}
          >
            {profile?.name || profile?.email || t("nav.profile")}
          </NavLink>
          <NavLink to="/more" className="shrink-0 text-sm font-medium text-gray-600">
            {t("nav.more")}
          </NavLink>
          <LanguageSwitcher />
        </div>
      </header>

      <main className="pb-32">
        <Outlet />
      </main>

      {onAssistantPage ? null : <AssistantButton />}

      <nav
        className="fixed bottom-0 left-0 right-0 z-20 flex border-t border-white/60 bg-white/90 backdrop-blur"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        {STAGE_NAV_ITEMS.map(({ to, key, icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] transition ${
                isActive ? "font-semibold text-green-700" : "text-gray-500 hover:text-gray-700"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <NavIcon
                  name={icon}
                  className={`h-6 w-6 transition ${isActive ? "scale-110" : ""}`}
                />
                <span className="max-w-full truncate px-1">{t(key)}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
