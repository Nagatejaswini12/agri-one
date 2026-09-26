import { useTranslation } from "react-i18next";
import { AgentCard } from "@/components/AgentCard";
import { tilesForStage, type Stage } from "@/app/agents";
import { STAGE_ACCENT } from "@/app/theme";

/**
 * A stage page: the same artwork cards the dashboard uses, from the same
 * registry, under the stage's own tint. A stage page and the home screen
 * can therefore never disagree about what a stage contains.
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
  const accent = STAGE_ACCENT[stage];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-10 pt-5 sm:px-6">
      <div className={`agri-card overflow-hidden bg-gradient-to-r ${accent.header}`}>
        <div className="flex items-center gap-2.5 px-5 py-4">
          <span className={`h-2.5 w-2.5 rounded-full ${accent.dot}`} aria-hidden="true" />
          <div>
            <h1 className="text-lg font-semibold text-agri-bright sm:text-xl">{t(titleKey)}</h1>
            <p className="mt-0.5 text-sm text-agri-mist">{t(descriptionKey)}</p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
        {tilesForStage(stage).map((tile) => (
          <AgentCard key={tile.id} tile={tile} />
        ))}
      </div>
    </div>
  );
}
