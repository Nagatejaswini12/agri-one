import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

/**
 * The frame around sign-in, sign-up and password recovery.
 *
 * This is the first screen anyone sees, so it carries the same dark
 * environment as the rest of the app rather than a plain panel — the
 * page's own drifting colour fields show through, and the form sits on
 * the same glass every card uses.
 */
export function AuthLayout({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-white/10 bg-agri-night/75 px-4 py-3 backdrop-blur-xl">
        <span className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-agri-emerald to-agri-cyan text-[13px] font-bold text-agri-night shadow-[0_0_18px_-2px_rgba(52,211,153,0.6)]">
            A
          </span>
          <span className="text-lg font-bold tracking-tight text-agri-bright">{t("appName")}</span>
        </span>
        <LanguageSwitcher />
      </header>
      <main className="relative flex flex-1 items-center justify-center p-4">
        {/* One slow emerald field, so the sign-in screen is not a flat
            dark rectangle. Decorative only.
            Centred with margins rather than a transform: `drift` sets
            `transform` itself, which replaced `-translate-x-1/2`
            outright and left a 384px circle starting at the middle of
            the screen — 193px of sideways scroll on a phone, on the
            first page anyone sees. `inset-x-0 mx-auto` cannot be
            overridden that way.
            It is also smaller below `sm`, because drift scales to 1.06
            and a 384px circle would still exceed a 390px viewport once
            scaled even when perfectly centred. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-1/3 mx-auto h-72 w-72 rounded-full bg-agri-emerald/10 blur-3xl animate-drift sm:h-96 sm:w-96"
        />
        <div className="agri-card relative w-full max-w-sm p-6">{children}</div>
      </main>
    </div>
  );
}
