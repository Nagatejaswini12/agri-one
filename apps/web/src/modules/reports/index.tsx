import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { FarmCrop, FarmFinancialRecord, YieldRecord } from "@agri-one/shared-types";
import { useFarms, useFarmCrops } from "@/modules/farms/hooks";
import {
  useDeleteFinancialRecord,
  useDeleteYieldRecord,
  useFinancialRecords,
  useYieldRecords
} from "@/modules/reports/hooks";
import { summarizeFinancials, summarizeYields } from "@/modules/reports/summarize";
import { FinancialForm } from "@/modules/reports/FinancialForm";
import { YieldForm } from "@/modules/reports/YieldForm";
import { useAppStore } from "@/stores/useAppStore";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";

/** Indian grouping, and always a real number — never a placeholder. */
function money(value: number): string {
  return `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(value)}`;
}

function quantity(value: number): string {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(value);
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

function cropName(crops: FarmCrop[] | undefined, cropId: string | null, fallback: string): string {
  if (cropId === null) return fallback;
  return crops?.find((c) => c.id === cropId)?.cropName ?? fallback;
}

function FinancialRow({
  record,
  crops,
  onDelete,
  deleting
}: {
  record: FarmFinancialRecord;
  crops: FarmCrop[] | undefined;
  onDelete: () => void;
  deleting: boolean;
}) {
  const { t } = useTranslation();
  const isRevenue = record.type === "revenue";
  return (
    <li className="rounded border bg-white p-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-sm font-medium">
          {t(`reports.category.${record.category}`, { defaultValue: record.category })}
        </span>
        <span className={`shrink-0 text-sm font-semibold ${isRevenue ? "text-green-700" : "text-gray-900"}`}>
          {isRevenue ? "+" : "−"}
          {money(record.amount)}
        </span>
      </div>
      <p className="mt-0.5 text-xs text-gray-500">
        {cropName(crops, record.cropId, t("reports.wholeFarm"))} · {formatDate(record.recordedOn)}
      </p>
      {record.notes ? <p className="mt-1 text-xs text-gray-600">{record.notes}</p> : null}
      <button
        type="button"
        onClick={onDelete}
        disabled={deleting}
        className="mt-2 text-xs font-medium text-red-700 underline disabled:opacity-50"
      >
        {t("common.delete")}
      </button>
    </li>
  );
}

function YieldRow({
  record,
  crops,
  onDelete,
  deleting
}: {
  record: YieldRecord;
  crops: FarmCrop[] | undefined;
  onDelete: () => void;
  deleting: boolean;
}) {
  const { t } = useTranslation();
  return (
    <li className="rounded border bg-white p-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-sm font-medium">
          {cropName(crops, record.cropId, t("reports.unknownCrop"))}
        </span>
        <span className="shrink-0 text-sm font-semibold">
          {quantity(record.quantity)}{" "}
          {t(`reports.unitName.${record.unit}`, { defaultValue: record.unit })}
        </span>
      </div>
      <p className="mt-0.5 text-xs text-gray-500">{formatDate(record.harvestedOn)}</p>
      <button
        type="button"
        onClick={onDelete}
        disabled={deleting}
        className="mt-2 text-xs font-medium text-red-700 underline disabled:opacity-50"
      >
        {t("common.delete")}
      </button>
    </li>
  );
}

export default function ReportsPage() {
  const { t } = useTranslation();
  const { data: farms, isLoading: farmsLoading } = useFarms();
  const activeFarmId = useAppStore((s) => s.activeFarmId);
  const setActiveFarmId = useAppStore((s) => s.setActiveFarmId);
  const [showFinancialForm, setShowFinancialForm] = useState(false);
  const [showYieldForm, setShowYieldForm] = useState(false);

  useEffect(() => {
    if (!activeFarmId && farms && farms.length > 0) setActiveFarmId(farms[0].id);
  }, [activeFarmId, farms, setActiveFarmId]);

  const activeFarm = farms?.find((f) => f.id === activeFarmId);
  const { data: crops } = useFarmCrops(activeFarmId ?? undefined);

  const financial = useFinancialRecords(activeFarmId ?? undefined);
  const yields = useYieldRecords(activeFarmId ?? undefined);
  const deleteFinancial = useDeleteFinancialRecord(activeFarmId ?? "");
  const deleteYield = useDeleteYieldRecord(activeFarmId ?? "");

  const summary = summarizeFinancials(financial.data);
  const yieldSummary = summarizeYields(yields.data);

  return (
    <div className="p-6">
      <PageHeader id="reports" titleKey="nav.reports" descKey="agent.reports" />
      <p className="mt-1 text-sm text-gray-600">{t("reports.intro")}</p>

      {farmsLoading ? <p className="mt-4 text-gray-500">{t("common.loading")}</p> : null}

      {!farmsLoading && (!farms || farms.length === 0) ? (
        <div className="mt-4">
          <EmptyState message={t("reports.noFarm")} actionLabel={t("farms.add")} actionTo="/farms" />
        </div>
      ) : null}

      {!farmsLoading && farms && farms.length > 0 && activeFarm ? (
        <>
          <div className="mt-4">
            <label htmlFor="reports-farm-select" className="block text-sm font-medium text-gray-700">
              {t("soil.selectFarm")}
            </label>
            <select
              id="reports-farm-select"
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

          {/* --- money summary ------------------------------------- */}
          <section className="mt-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              {t("reports.moneyTitle")}
            </h2>

            {financial.isLoading ? <p className="mt-2 text-gray-500">{t("common.loading")}</p> : null}
            {financial.isError ? <p className="mt-2 text-sm text-red-600">{t("reports.loadError")}</p> : null}

            {/* No entries means no numbers — never a fabricated ₹0. */}
            {!financial.isLoading && !financial.isError && !summary.hasEntries ? (
              <div className="mt-2">
                <EmptyState message={t("reports.noFinancialEntries")} />
              </div>
            ) : null}

            {summary.hasEntries ? (
              <div className="mt-2 rounded-lg border bg-white p-4">
                <dl className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <dt className="text-gray-500">{t("reports.totalRevenue")}</dt>
                    <dd className="font-semibold text-green-700">{money(summary.revenue)}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">{t("reports.totalCost")}</dt>
                    <dd className="font-semibold">{money(summary.cost)}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">{t("reports.margin")}</dt>
                    <dd className={`font-semibold ${summary.margin < 0 ? "text-red-700" : "text-green-700"}`}>
                      {money(summary.margin)}
                    </dd>
                  </div>
                </dl>
                <p className="mt-2 text-xs text-gray-500">
                  {t("reports.entriesCounted", { count: summary.entryCount })}
                </p>
                <p className="mt-1 text-xs text-gray-500">{t("reports.marginNote")}</p>
              </div>
            ) : null}
          </section>

          {/* --- harvest summary ----------------------------------- */}
          <section className="mt-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              {t("reports.yieldTitle")}
            </h2>

            {yields.isLoading ? <p className="mt-2 text-gray-500">{t("common.loading")}</p> : null}
            {yields.isError ? <p className="mt-2 text-sm text-red-600">{t("reports.loadError")}</p> : null}

            {!yields.isLoading && !yields.isError && !yieldSummary.hasEntries ? (
              <div className="mt-2">
                <EmptyState message={t("reports.noYieldEntries")} />
              </div>
            ) : null}

            {yieldSummary.hasEntries ? (
              <div className="mt-2 rounded-lg border bg-white p-4">
                {/* One line per unit: quantities in different units are
                    never added together. */}
                <ul className="space-y-1 text-sm">
                  {yieldSummary.totals.map((total) => (
                    <li key={total.unit} className="flex justify-between">
                      <span className="text-gray-500">
                        {t(`reports.unitName.${total.unit}`, { defaultValue: total.unit })}
                      </span>
                      <span className="font-semibold">{quantity(total.quantity)}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-gray-500">{t("reports.unitNote")}</p>
              </div>
            ) : null}
          </section>

          {/* --- entry forms --------------------------------------- */}
          <section className="mt-6">
            <button
              type="button"
              onClick={() => setShowFinancialForm((v) => !v)}
              className="rounded border px-3 py-2 text-sm font-medium text-green-700"
            >
              {showFinancialForm ? t("common.cancel") : t("reports.addEntry")}
            </button>
            {showFinancialForm ? <FinancialForm farmId={activeFarm.id} crops={crops ?? []} /> : null}
          </section>

          <section className="mt-4">
            {crops && crops.length > 0 ? (
              <>
                <button
                  type="button"
                  onClick={() => setShowYieldForm((v) => !v)}
                  className="rounded border px-3 py-2 text-sm font-medium text-green-700"
                >
                  {showYieldForm ? t("common.cancel") : t("reports.addHarvest")}
                </button>
                {showYieldForm ? <YieldForm farmId={activeFarm.id} crops={crops} /> : null}
              </>
            ) : (
              <EmptyState
                message={t("reports.noCrops")}
                actionLabel={t("farms.addCrop")}
                actionTo={`/farms/${activeFarm.id}`}
              />
            )}
          </section>

          {/* --- entry lists --------------------------------------- */}
          {financial.data && financial.data.length > 0 ? (
            <section className="mt-6">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                {t("reports.moneyEntries")}
              </h2>
              <ul className="mt-2 space-y-2">
                {financial.data.map((record) => (
                  <FinancialRow
                    key={record.id}
                    record={record}
                    crops={crops}
                    deleting={deleteFinancial.isPending}
                    onDelete={() => deleteFinancial.mutate(record.id)}
                  />
                ))}
              </ul>
            </section>
          ) : null}

          {yields.data && yields.data.length > 0 ? (
            <section className="mt-6">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                {t("reports.yieldEntries")}
              </h2>
              <ul className="mt-2 space-y-2">
                {yields.data.map((record) => (
                  <YieldRow
                    key={record.id}
                    record={record}
                    crops={crops}
                    deleting={deleteYield.isPending}
                    onDelete={() => deleteYield.mutate(record.id)}
                  />
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
