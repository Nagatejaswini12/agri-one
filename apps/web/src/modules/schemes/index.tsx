import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { SchemeCriterion, SchemeMatch, SchemeMatchResult } from "@agri-one/shared-types";
import { useFarms, useFarmCrops } from "@/modules/farms/hooks";
import { useSchemes } from "@/modules/schemes/hooks";
import { useAppStore } from "@/stores/useAppStore";
import { EmptyState } from "@/components/EmptyState";
import { DataUnavailable } from "@/components/DataUnavailable";
import { PageHeader } from "@/components/PageHeader";

const GROUP_ORDER = ["matched", "needs_check", "other"] as const;

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

/**
 * Criterion labels live in the locale files rather than the catalog, so
 * they read in the farmer's own language. The scheme's own name, purpose
 * and benefit stay in the source's wording — translating an official
 * entitlement ourselves would risk changing what it promises.
 */
function CriterionRow({ criterion }: { criterion: SchemeCriterion }) {
  const { t } = useTranslation();
  const label = t(`schemes.criteria.${criterion.key}`, {
    ...(criterion.params ?? {}),
    defaultValue: t("schemes.criteriaUnknown")
  });
  const mark =
    criterion.status === "matched" ? "✓" : criterion.status === "not_matched" ? "✕" : "?";
  const tone =
    criterion.status === "matched"
      ? "text-green-700"
      : criterion.status === "not_matched"
        ? "text-red-700"
        : "text-amber-700";

  return (
    <li className="flex gap-2 text-sm">
      <span className={`shrink-0 font-semibold ${tone}`} aria-hidden="true">
        {mark}
      </span>
      <span className="min-w-0">
        <span className="sr-only">{t(`schemes.status.${criterion.status}`)}: </span>
        {label}
      </span>
    </li>
  );
}

function SchemeCard({ match }: { match: SchemeMatch }) {
  const { t } = useTranslation();
  const { scheme, criteria } = match;
  const checkable = criteria.filter((c) => c.status !== "cannot_check");
  const unverifiable = criteria.filter((c) => c.status === "cannot_check");

  return (
    <li className="rounded-lg border bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 font-medium">{scheme.name}</h3>
        <span className="shrink-0 rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
          {t(`schemes.level.${scheme.level}`)}
        </span>
      </div>

      {scheme.purpose ? <p className="mt-1 text-sm text-gray-600">{scheme.purpose}</p> : null}

      {scheme.benefit ? (
        <p className="mt-2 rounded bg-gray-50 px-3 py-2 text-sm">{scheme.benefit}</p>
      ) : null}

      {checkable.length > 0 ? (
        <div className="mt-3">
          <h4 className="text-xs font-medium uppercase tracking-wide text-gray-500">
            {t("schemes.basedOnYourRecords")}
          </h4>
          <ul className="mt-1 space-y-1">
            {checkable.map((c) => (
              <CriterionRow key={c.key} criterion={c} />
            ))}
          </ul>
        </div>
      ) : null}

      {/* Always present — the catalog guarantees at least one. This is
          what keeps the page from reading as an eligibility verdict. */}
      <div className="mt-3">
        <h4 className="text-xs font-medium uppercase tracking-wide text-amber-700">
          {t("schemes.youMustCheck")}
        </h4>
        <ul className="mt-1 space-y-1">
          {unverifiable.map((c) => (
            <CriterionRow key={c.key} criterion={c} />
          ))}
        </ul>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
        <a
          href={scheme.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-green-700 underline"
        >
          {t("schemes.officialLink")}
        </a>
        <span>{t("schemes.source", { source: scheme.sourceName })}</span>
        <span>
          {scheme.lastVerifiedOn === null
            ? t("schemes.lastVerifiedUnknown")
            : t("schemes.lastVerified", { date: formatDate(scheme.lastVerifiedOn) })}
        </span>
        {match.stale ? <span className="text-amber-700">{t("schemes.stale")}</span> : null}
      </div>
    </li>
  );
}

function SchemesView({
  data,
  asOf
}: {
  data: SchemeMatchResult;
  asOf: string;
}) {
  const { t } = useTranslation();

  return (
    <div className="mt-4 space-y-4">
      <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        {t("schemes.disclaimer")}
      </p>

      {data.stateSchemesSkipped > 0 ? (
        <p className="rounded-lg border border-dashed p-3 text-sm text-gray-600">
          {/* `count` (not `n`) is what i18next pluralizes on, and Tamil,
              Telugu and Hindi each need their own plural forms. */}
          {t("schemes.stateSchemesSkipped", { count: data.stateSchemesSkipped })}
        </p>
      ) : null}

      {GROUP_ORDER.map((group) => {
        const inGroup = data.matches.filter((m) => m.group === group);
        if (inGroup.length === 0) return null;
        return (
          <section key={group}>
            <h2 className="text-sm font-medium text-gray-700">
              {t(`schemes.group.${group}`)} ({inGroup.length})
            </h2>
            <p className="text-xs text-gray-500">{t(`schemes.groupHint.${group}`)}</p>
            <ul className="mt-2 space-y-3">
              {inGroup.map((m) => (
                <SchemeCard key={m.scheme.id} match={m} />
              ))}
            </ul>
          </section>
        );
      })}

      <p className="text-xs text-gray-500">
        {data.catalogVerifiedOn === null
          ? t("schemes.catalogVerifiedUnknown")
          : t("schemes.catalogVerified", { date: formatDate(data.catalogVerifiedOn) })}
        {` · ${t("schemes.fetchedAt", { time: new Date(asOf).toLocaleTimeString() })}`}
      </p>
      <p className="text-xs text-gray-500">{t("schemes.curatedNote")}</p>
    </div>
  );
}

export default function SchemesPage() {
  const { t } = useTranslation();
  const { data: farms, isLoading: farmsLoading } = useFarms();
  const activeFarmId = useAppStore((s) => s.activeFarmId);
  const setActiveFarmId = useAppStore((s) => s.setActiveFarmId);

  useEffect(() => {
    if (!activeFarmId && farms && farms.length > 0) {
      setActiveFarmId(farms[0].id);
    }
  }, [activeFarmId, farms, setActiveFarmId]);

  const activeFarm = farms?.find((f) => f.id === activeFarmId);
  const hasState = activeFarm?.state != null;
  const { data: crops } = useFarmCrops(activeFarmId ?? undefined);
  const { data: result, isLoading: schemesLoading, isError } = useSchemes(activeFarm, crops);

  return (
    <div className="p-6">
      <PageHeader id="schemes" titleKey="nav.schemes" descKey="agent.schemes" art="/agents/schemes.webp" />

      {farmsLoading ? <p className="mt-4 text-gray-500">{t("common.loading")}</p> : null}

      {!farmsLoading && (!farms || farms.length === 0) ? (
        <div className="mt-4">
          <EmptyState message={t("schemes.noFarm")} actionLabel={t("farms.add")} actionTo="/farms" />
        </div>
      ) : null}

      {!farmsLoading && farms && farms.length > 0 ? (
        <>
          <div className="mt-4">
            <label htmlFor="schemes-farm-select" className="block text-sm font-medium text-gray-700">
              {t("soil.selectFarm")}
            </label>
            <select
              id="schemes-farm-select"
              value={activeFarmId ?? ""}
              onChange={(e) => setActiveFarmId(e.target.value || null)}
              className="mt-1 rounded border px-3 py-2"
            >
              {farms.map((farm) => (
                <option key={farm.id} value={farm.id}>
                  {farm.name}
                </option>
              ))}
            </select>
          </div>

          {/* Not a blocker: central schemes still apply. It tells the
              farmer why the state-specific ones are missing. */}
          {activeFarm && !hasState ? (
            <div className="mt-4">
              <EmptyState
                message={t("schemes.noState")}
                actionLabel={t("schemes.setState")}
                actionTo={`/farms/${activeFarm.id}`}
              />
            </div>
          ) : null}

          {schemesLoading ? <p className="mt-4 text-gray-500">{t("common.loading")}</p> : null}

          {isError ? (
            <div className="mt-4">
              <DataUnavailable reason={t("schemes.loadError")} />
            </div>
          ) : null}

          {result && result.status === "unavailable" ? (
            <div className="mt-4">
              <DataUnavailable reason={result.reason} />
            </div>
          ) : null}

          {result && result.status === "ok" ? (
            <SchemesView data={result.data} asOf={result.asOf} />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
