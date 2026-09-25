import { useTranslation } from "react-i18next";
import { AgentCard } from "@/components/AgentCard";
import { SUPPORT_TILES } from "@/app/agents";

/**
 * The supporting tools, which belong to no single stage: the assistant,
 * the ledger and the scan archive are reached from here rather than
 * competing for a slot in the journey.
 */
export default function MoreHub() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-8 pt-5 sm:px-6">
      <h1 className="text-xl font-semibold">{t("stages.more.title")}</h1>
      <p className="mt-1 text-gray-600">{t("stages.more.description")}</p>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
        {SUPPORT_TILES.map((tile) => (
          <AgentCard key={tile.id} tile={tile} />
        ))}
      </div>
    </div>
  );
}
