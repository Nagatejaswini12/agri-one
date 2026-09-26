import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

/**
 * Without a catch-all route, react-router matched nothing and rendered
 * nothing — a typo'd URL, a stale bookmark or an old PWA shortcut left a
 * farmer staring at a blank white screen with no way back.
 */
export function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold">{t("notFound.title")}</h1>
      <p className="mt-2 text-agri-mist">{t("notFound.message")}</p>
      <Link to="/" className="mt-4 inline-block font-medium text-agri-emerald underline">
        {t("notFound.backHome")}
      </Link>
    </div>
  );
}
