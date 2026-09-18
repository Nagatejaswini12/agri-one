import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

interface StageHubLink {
  to: string;
  labelKey: string;
}

/**
 * Landing page for a PLAN/PROTECT/SELL/More stage grouping — the report's
 * PLAN → GROW → PROTECT → SELL framing maps to this nav structure instead
 * of a flat per-module list. GROW has a single module (Weather & Advisory)
 * so it links straight there instead of using this hub.
 */
export function StageHub({ titleKey, descriptionKey, links }: { titleKey: string; descriptionKey: string; links: StageHubLink[] }) {
  const { t } = useTranslation();
  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold">{t(titleKey)}</h1>
      <p className="mt-1 text-gray-600">{t(descriptionKey)}</p>
      <div className="mt-4 grid gap-3">
        {links.map(({ to, labelKey }) => (
          <Link
            key={to}
            to={to}
            className="rounded-lg border bg-white p-4 font-medium text-green-800 shadow-sm hover:bg-green-50"
          >
            {t(labelKey)}
          </Link>
        ))}
      </div>
    </div>
  );
}
