import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { NavIcon } from "@/components/NavIcon";
import { AssistantButton } from "@/components/AssistantButton";
import { useFarmerProfile, useSyncLanguageFromProfile } from "@/modules/profile/hooks";

// Mirrors the report's PLAN → GROW → PROTECT → SELL journey. Home and More
// sit outside that journey; the assistant is reachable from anywhere via
// the floating button rather than competing for a nav slot.
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
    <div className="min-h-screen">
      {/* The profile link shows the farmer's own name or email, and an
          email is long enough to push the language selector off the
          right edge of a phone — which made every screen scroll
          sideways. The name truncates instead; the title and the
          selector never shrink. */}
      <header className="sticky top-0 z-20 border-b border-white/60 bg-agri-ivory/85 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-2.5 sm:px-6">
          <NavLink to="/" className="flex shrink-0 items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-agri-forest to-agri-leaf text-[13px] font-bold text-white shadow-sm">
              A
            </span>
            <span className="text-base font-bold tracking-tight text-agri-forest sm:text-lg">
              {t("appName")}
            </span>
          </NavLink>

          {/* On a wide screen the stages sit in the header as well, so a
              desktop visitor is not reaching for a phone-style bar at
              the bottom of the window. */}
          <nav className="hidden items-center gap-0.5 lg:flex" aria-label={t("dashboard.journeyTitle")}>
            {STAGE_NAV_ITEMS.map(({ to, key, icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition ${
                    isActive
                      ? "bg-agri-forest/8 font-semibold text-agri-forest"
                      : "text-gray-600 hover:bg-white/70 hover:text-agri-forest"
                  }`
                }
              >
                <NavIcon name={icon} className="h-4 w-4" />
                <span className="max-w-[8rem] truncate">{t(key)}</span>
              </NavLink>
            ))}
          </nav>

          <div className="flex min-w-0 items-center justify-end gap-2 sm:gap-3">
            <NavLink
              to="/profile"
              className="min-w-0 truncate text-sm font-medium text-gray-600 hover:text-agri-forest"
              title={profile?.name || profile?.email || undefined}
            >
              {profile?.name || profile?.email || t("nav.profile")}
            </NavLink>
            <NavLink
              to="/more"
              className="shrink-0 text-sm font-medium text-gray-600 hover:text-agri-forest"
            >
              {t("nav.more")}
            </NavLink>
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <main className="pb-32 lg:pb-12">
        <Outlet />
      </main>

      {onAssistantPage ? null : <AssistantButton />}

      {/* The phone bar. Hidden once the stages are in the header. */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-20 flex border-t border-white/60 bg-agri-ivory/95 backdrop-blur-sm lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        aria-label={t("dashboard.journeyTitle")}
      >
        {STAGE_NAV_ITEMS.map(({ to, key, icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `relative flex flex-1 flex-col items-center gap-1 pb-2 pt-2.5 text-[11px] transition ${
                isActive ? "font-semibold text-agri-forest" : "text-gray-500"
              }`
            }
          >
            {({ isActive }) => (
              <>
                {/* The active stage gets a filled pill behind its icon —
                    a colour change alone is easy to miss at a glance in
                    bright sun. */}
                <span
                  className={`flex h-8 w-12 items-center justify-center rounded-full transition ${
                    isActive ? "bg-agri-forest/10" : ""
                  }`}
                >
                  <NavIcon name={icon} className="h-5 w-5" />
                </span>
                <span className="max-w-full truncate px-1 leading-tight">{t(key)}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
