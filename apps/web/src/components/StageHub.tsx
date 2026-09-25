import { useTranslation } from "react-i18next";
import { AgentCard } from "@/components/AgentCard";
import { tilesForStage, type Stage } from "@/app/agents";

/**
 * Landing page for a PLAN/GROW/PROTECT/SELL stage.
 *
 * It now renders the same large artwork cards the dashboard uses, from
 * the same registry, so a stage page and the home screen can never
 * disagree about what a stage contains or what a module is called.
 */
export function StageHub({
  stage,
  titleKey,
  descriptionKey
}: {
  stage: Stage;
  titleKey: string;
  descriptionKey: string;
}) {
  const { t } = useTranslation();
  const tiles = tilesForStage(stage);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-8 pt-5 sm:px-6">
      <h1 className="text-xl font-semibold">{t(titleKey)}</h1>
      <p className="mt-1 text-gray-600">{t(descriptionKey)}</p>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-4">
        {tiles.map((tile) => (
          <AgentCard key={tile.id} tile={tile} />
        ))}
      </div>
    </div>
  );
}
