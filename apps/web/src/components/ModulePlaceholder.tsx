import { useTranslation } from "react-i18next";

export function ModulePlaceholder({ titleKey }: { titleKey: string }) {
  const { t } = useTranslation();
  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold">{t(titleKey)}</h1>
      <p className="mt-2 text-gray-600">{t("common.comingSoon")}</p>
    </div>
  );
}
