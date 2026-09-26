import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { MarketPriceQuote, MarketSnapshot } from "@agri-one/shared-types";
import { useFarms, useFarmCrops } from "@/modules/farms/hooks";
import { useMarket } from "@/modules/market/hooks";
import { useAppStore } from "@/stores/useAppStore";
import { EmptyState } from "@/components/EmptyState";
import { DataUnavailable } from "@/components/DataUnavailable";
import { PageHero } from "@/components/PageHero";
import { SelectorPanel } from "@/components/SelectorPanel";

/**
 * A price the source didn't report renders as a dash, never as ₹0 — a
 * zero would read as "this crop sold for nothing".
 */
function price(value: number | null): string {
  return value === null ? "—" : `₹${new Intl.NumberFormat("en-IN").format(value)}`;
}

/** Same rule for the text fields: absent is a dash, not an empty cell. */
function text(value: string | null): string {
  return value ?? "—";
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

function QuoteCard({ quote }: { quote: MarketPriceQuote }) {
  const { t } = useTranslation();
  return (
    <li className="rounded-lg border bg-agri-bark p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="min-w-0 truncate font-medium">{quote.market}</h3>
        <p className="shrink-0 text-lg font-semibold">{price(quote.modalPrice)}</p>
      </div>
      <p className="text-right text-xs text-agri-muted">{t("market.modal")}</p>

      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-agri-muted">{t("market.min")}</dt>
          <dd>{price(quote.minPrice)}</dd>
        </div>
        <div>
          <dt className="text-agri-muted">{t("market.max")}</dt>
          <dd>{price(quote.maxPrice)}</dd>
        </div>
        <div>
          <dt className="text-agri-muted">{t("market.variety")}</dt>
          <dd className="truncate">{text(quote.variety)}</dd>
        </div>
        <div>
          <dt className="text-agri-muted">{t("market.grade")}</dt>
          <dd className="truncate">{text(quote.grade)}</dd>
        </div>
      </dl>

      {/* The snapshot's headline date covers the dated rows; only a row
          whose own date was unreadable needs saying so here. */}
      {quote.reportedOn === null ? (
        <p className="mt-2 text-xs text-agri-muted">{t("market.reportedOnUnknown")}</p>
      ) : null}
    </li>
  );
}

function MarketView({
  data,
  asOf,
  source
}: {
  data: MarketSnapshot;
  asOf: string;
  source: string;
}) {
  const { t } = useTranslation();

  return (
    <div className="mt-4 space-y-4">
      <section className="rounded-lg border bg-agri-bark p-4">
        <h2 className="text-lg font-semibold">{data.commodity}</h2>
        <p className="text-sm text-agri-mist">
          {t("market.location", { district: data.district, state: data.state })}
        </p>

        {/* The reported-on date is the farmer's answer to "how current is
            this?", so it leads rather than sitting in the footnote. */}
        <p className="mt-3 rounded bg-white/5 px-3 py-2 text-sm font-medium">
          {data.latestReportedOn === null
            ? t("market.reportedOnUnknown")
            : t("market.reportedOn", { date: formatDate(data.latestReportedOn) })}
        </p>
        <p className="mt-2 text-xs text-agri-muted">{t("market.priceUnit")}</p>
      </section>

      <section>
        <h2 className="text-sm font-medium text-agri-mist">
          {t("market.mandis", { n: data.quotes.length })}
        </h2>
        <ul className="mt-2 space-y-3">
          {data.quotes.map((quote, i) => (
            <QuoteCard key={`${quote.market}-${quote.variety ?? ""}-${quote.grade ?? ""}-${i}`} quote={quote} />
          ))}
        </ul>
      </section>

      <p className="text-xs text-agri-muted">
        {t("market.sourceNote", { source })}
        {` · ${t("market.fetchedAt", { time: new Date(asOf).toLocaleTimeString() })}`}
      </p>
      <p className="text-xs text-agri-muted">{t("market.snapshotNote")}</p>
    </div>
  );
}

export default function MarketPage() {
  const { t } = useTranslation();
  const { data: farms, isLoading: farmsLoading } = useFarms();
  const activeFarmId = useAppStore((s) => s.activeFarmId);
  const setActiveFarmId = useAppStore((s) => s.setActiveFarmId);
  const [selectedCropId, setSelectedCropId] = useState<string | null>(null);

  useEffect(() => {
    if (!activeFarmId && farms && farms.length > 0) {
      setActiveFarmId(farms[0].id);
    }
  }, [activeFarmId, farms, setActiveFarmId]);

  const activeFarm = farms?.find((f) => f.id === activeFarmId);
  const hasLocation = activeFarm?.state != null && activeFarm?.district != null;

  const { data: crops, isLoading: cropsLoading } = useFarmCrops(activeFarmId ?? undefined);

  // Reset rather than carry a crop id across farms — it belongs to one farm.
  useEffect(() => {
    if (crops && crops.length > 0) {
      if (!crops.some((c) => c.id === selectedCropId)) setSelectedCropId(crops[0].id);
    } else if (selectedCropId !== null) {
      setSelectedCropId(null);
    }
  }, [crops, selectedCropId]);

  const commodity = crops?.find((c) => c.id === selectedCropId)?.cropName ?? null;
  const { data: result, isLoading: marketLoading, isError } = useMarket(activeFarm, commodity);

  const canQuery = hasLocation && commodity !== null;

  return (
    <div className="p-6">
      <PageHero id="market" titleKey="nav.market" descKey="agent.market" art="/agents/market.webp" />

      {farmsLoading ? <p className="mt-4 text-agri-muted">{t("common.loading")}</p> : null}

      {!farmsLoading && (!farms || farms.length === 0) ? (
        <div className="mt-4">
          <EmptyState message={t("market.noFarm")} actionLabel={t("farms.add")} actionTo="/farms" />
        </div>
      ) : null}

      {!farmsLoading && farms && farms.length > 0 ? (
        <>
          <SelectorPanel id="market">
            <label htmlFor="market-farm-select" className="block text-xs font-semibold text-agri-muted">
              {t("soil.selectFarm")}
            </label>
            <select
              id="market-farm-select"
              value={activeFarmId ?? ""}
              onChange={(e) => setActiveFarmId(e.target.value || null)}
              className="agri-field mt-1"
            >
              {farms.map((farm) => (
                <option key={farm.id} value={farm.id}>
                  {farm.name}
                </option>
              ))}
            </select>
          </SelectorPanel>

          {activeFarm && !hasLocation ? (
            <div className="mt-4">
              <EmptyState
                message={t("market.noLocation")}
                actionLabel={t("market.setLocation")}
                actionTo={`/farms/${activeFarm.id}`}
              />
            </div>
          ) : null}

          {activeFarm && hasLocation && cropsLoading ? (
            <p className="mt-4 text-agri-muted">{t("common.loading")}</p>
          ) : null}

          {activeFarm && hasLocation && !cropsLoading && (!crops || crops.length === 0) ? (
            <div className="mt-4">
              <EmptyState
                message={t("market.noCrops")}
                actionLabel={t("market.addCrop")}
                actionTo={`/farms/${activeFarm.id}`}
              />
            </div>
          ) : null}

          {hasLocation && crops && crops.length > 0 ? (
            <SelectorPanel id="market">
              <label htmlFor="market-crop-select" className="block text-xs font-semibold text-agri-muted">
                {t("market.selectCrop")}
              </label>
              <select
                id="market-crop-select"
                value={selectedCropId ?? ""}
                onChange={(e) => setSelectedCropId(e.target.value || null)}
                className="agri-field mt-1"
              >
                {crops.map((crop) => (
                  <option key={crop.id} value={crop.id}>
                    {crop.cropName}
                  </option>
                ))}
              </select>
            </SelectorPanel>
          ) : null}

          {canQuery && marketLoading ? (
            <p className="mt-4 text-agri-muted">{t("common.loading")}</p>
          ) : null}

          {canQuery && isError ? (
            <div className="mt-4">
              <DataUnavailable reason={t("market.loadError")} />
            </div>
          ) : null}

          {canQuery && result && result.status === "unavailable" ? (
            <div className="mt-4">
              <DataUnavailable reason={result.reason} />
            </div>
          ) : null}

          {canQuery && result && result.status === "ok" ? (
            <MarketView data={result.data} asOf={result.asOf} source={result.source} />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
