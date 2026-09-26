import { useTranslation } from "react-i18next";
import { AgentCard } from "@/components/AgentCard";
import { TOOL_TILES } from "@/app/agents";

/** The farmer's own records, reached from anywhere in the journey. */
export default function MoreHub() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-10 pt-5 sm:px-6">
      <h1 className="text-lg font-semibold text-agri-bright sm:text-xl">{t("stages.more.title")}</h1>
      <p className="mt-0.5 text-sm text-agri-mist">{t("stages.more.description")}</p>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
        {TOOL_TILES.map((tile) => (
          <AgentCard key={tile.id} tile={tile} />
        ))}
      </div>
    </div>
  );
}
