import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type {
  DecisionAction,
  DecisionPriority,
  DecisionSourceAgent,
  Farm,
  FarmBriefing,
  SignalStatus
} from "@agri-one/shared-types";
import { useFarmCrops } from "@/modules/farms/hooks";
import { useSoilRecords } from "@/modules/soil-water/hooks";
import { useScans } from "@/modules/scan-crop/hooks";
import { useBriefing } from "@/modules/dashboard/hooks";
import { DataUnavailable } from "@/components/DataUnavailable";

const PRIORITY_GROUPS: readonly DecisionPriority[] = ["high", "medium", "low"];

const SIGNAL_ORDER: readonly DecisionSourceAgent[] = [
  "weather",
  "market",
  "schemes",
  "diagnosis",
  "soil",
  "farm"
];

/** Where each briefing line came from, so the farmer can go read it. */
const SOURCE_ROUTE: Record<DecisionSourceAgent, string> = {
  weather: "/weather",
  market: "/market",
  schemes: "/schemes",
  diagnosis: "/scan-history",
  soil: "/soil-water",
  farm: "/farms"
};

const PRIORITY_STYLE: Record<DecisionPriority, string> = {
  high: "border-l-4 border-l-red-500",
  medium: "border-l-4 border-l-amber-400",
  low: "border-l-4 border-l-gray-300"
};

const SIGNAL_MARK: Record<SignalStatus["status"], string> = {
  ok: "✓",
  skipped: "–",
  unavailable: "!"
};

const SIGNAL_TONE: Record<SignalStatus["status"], string> = {
  ok: "text-green-700",
  skipped: "text-gray-500",
  unavailable: "text-amber-700"
};

function ActionRow({ action }: { action: DecisionAction }) {
  const { t } = useTranslation();
  return (
    <li className={`rounded bg-white p-3 ${PRIORITY_STYLE[action.priority]}`}>
      <p className="text-sm">
        {t(`decision.action.${action.key}`, {
          ...(action.params ?? {}),
          defaultValue: t("decision.actionUnknown")
        })}
      </p>
      <Link
        to={SOURCE_ROUTE[action.sourceAgent]}
        className="mt-1 inline-block text-xs font-medium text-green-700 underline"
      >
        {t(`decision.signal.${action.sourceAgent}`)} ›
      </Link>
    </li>
  );
}

function SignalRow({ agent, signal }: { agent: DecisionSourceAgent; signal: SignalStatus }) {
  const { t } = useTranslation();
  return (
    <li className="flex items-baseline gap-2 text-xs">
      <span className={`shrink-0 font-semibold ${SIGNAL_TONE[signal.status]}`} aria-hidden="true">
        {SIGNAL_MARK[signal.status]}
      </span>
      <span className="font-medium">{t(`decision.signal.${agent}`)}</span>
      <span className="text-gray-500">
        <span className="sr-only">{t(`decision.status.${signal.status}`)}: </span>
        {signal.reasonKey
          ? t(`decision.signalReason.${signal.reasonKey}`, {
              defaultValue: t("decision.signalReason.agentUnavailable")
            })
          : t("decision.signalOk")}
      </span>
    </li>
  );
}

function BriefingView({ data, asOf }: { data: FarmBriefing; asOf: string }) {
  const { t } = useTranslation();

  return (
    <div className="mt-2 space-y-4">
      <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        {t("decision.disclaimer")}
      </p>

      {data.actions.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-center text-sm text-gray-500">
          {t("decision.nothingToFlag")}
        </p>
      ) : (
        PRIORITY_GROUPS.map((priority) => {
          const inGroup = data.actions.filter((a) => a.priority === priority);
          if (inGroup.length === 0) return null;
          return (
            <section key={priority}>
              <h3 className="text-sm font-medium text-gray-700">
                {t(`decision.group.${priority}`)} ({inGroup.length})
              </h3>
              <ul className="mt-2 space-y-2">
                {inGroup.map((a) => (
                  <ActionRow key={`${a.sourceAgent}-${a.key}`} action={a} />
                ))}
              </ul>
            </section>
          );
        })
      )}

      {/* Every agent is listed, including the ones that failed or were
          skipped — a shorter briefing must never look like a complete one. */}
      <section className="rounded-lg border bg-gray-50 p-3">
        <h3 className="text-xs font-medium uppercase tracking-wide text-gray-500">
          {t("decision.signalsUsed")}
        </h3>
        <ul className="mt-2 space-y-1">
          {SIGNAL_ORDER.map((agent) => (
            <SignalRow key={agent} agent={agent} signal={data.signals[agent]} />
          ))}
        </ul>
      </section>

      <p className="text-xs text-gray-500">
        {t("decision.generatedAt", { time: new Date(asOf).toLocaleTimeString() })}
      </p>
    </div>
  );
}

/**
 * `hideHeading` lets the dashboard present the briefing inside its own
 * titled card without printing the same title twice. Presentation only —
 * nothing about which signals are fetched or how they are rendered
 * changes.
 */
export function Briefing({ farm, hideHeading = false }: { farm: Farm; hideHeading?: boolean }) {
  const { t } = useTranslation();
  const { data: crops } = useFarmCrops(farm.id);
  const { data: soilRecords } = useSoilRecords(farm.id);
  const { data: scans } = useScans(farm.id);

  const activeCrops = (crops ?? []).filter((c) => c.status === "active");
  const [selectedCrop, setSelectedCrop] = useState<string | null>(null);

  // Default to the first active crop, and reset when the farm changes —
  // a crop belongs to one farm.
  useEffect(() => {
    if (activeCrops.length === 0) {
      if (selectedCrop !== null) setSelectedCrop(null);
      return;
    }
    if (!activeCrops.some((c) => c.cropName === selectedCrop)) {
      setSelectedCrop(activeCrops[0].cropName);
    }
  }, [activeCrops, selectedCrop]);

  const { data: result, isLoading, isError } = useBriefing(
    farm,
    crops,
    soilRecords,
    scans,
    selectedCrop
  );

  return (
    <section className={hideHeading ? "" : "mt-6"}>
      {hideHeading ? null : (
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          {t("decision.title")}
        </h2>
      )}

      {/* The market signal covers exactly one crop. Naming it — and
          letting the farmer switch it — is the alternative to implying
          the briefing priced everything they grow. */}
      {activeCrops.length > 0 ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label htmlFor="briefing-crop-select" className="text-sm text-gray-700">
            {t("decision.marketCropLabel")}
          </label>
          {activeCrops.length === 1 ? (
            <span className="rounded bg-gray-100 px-2 py-1 text-sm font-medium">
              {activeCrops[0].cropName}
            </span>
          ) : (
            <select
              id="briefing-crop-select"
              value={selectedCrop ?? ""}
              onChange={(e) => setSelectedCrop(e.target.value || null)}
              className="rounded border px-2 py-1 text-sm"
            >
              {activeCrops.map((c) => (
                <option key={c.id} value={c.cropName}>
                  {c.cropName}
                </option>
              ))}
            </select>
          )}
          <span className="text-xs text-gray-500">{t("decision.marketCropNote")}</span>
        </div>
      ) : null}

      {isLoading ? <p className="mt-2 text-gray-500">{t("decision.loading")}</p> : null}

      {isError ? (
        <div className="mt-2">
          <DataUnavailable reason={t("decision.loadError")} />
        </div>
      ) : null}

      {result && result.status === "unavailable" ? (
        <div className="mt-2">
          <DataUnavailable reason={result.reason} />
        </div>
      ) : null}

      {result && result.status === "ok" ? (
        <BriefingView data={result.data} asOf={result.asOf} />
      ) : null}
    </section>
  );
}
