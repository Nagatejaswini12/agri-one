import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { MarketSnapshot } from "@agri-one/shared-types";
import { useFarms, useFarmCrops } from "@/modules/farms/hooks";
import { useMarket } from "@/modules/market/hooks";
import { groupVenues, type SellingVenue, type VenueGroup } from "@/modules/marketplace/groupVenues";
import { channelsForState } from "@/modules/marketplace/officialChannels";
import { useAppStore } from "@/stores/useAppStore";
import { EmptyState } from "@/components/EmptyState";
import { DataUnavailable } from "@/components/DataUnavailable";
import { PageHero } from "@/components/PageHero";
import { SelectorPanel } from "@/components/SelectorPanel";

/** A price the source didn't report renders as a dash, never as ₹0. */
function money(value: number | null): string {
  return value === null ? "—" : `₹${new Intl.NumberFormat("en-IN").format(value)}`;
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

function VenueRow({ venue }: { venue: SellingVenue }) {
  const { t } = useTranslation();
  return (
    <li className="rounded-lg border bg-agri-bark p-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate font-medium">{venue.market}</span>
        <span className="shrink-0 font-semibold">{money(venue.modalPrice)}</span>
      </div>
      <p className="mt-0.5 text-xs text-agri-muted">
        {t(`marketplace.kind.${venue.kind}`)}
        {venue.minPrice !== null || venue.maxPrice !== null ? (
          <>
            {" · "}
            {t("market.min")} {money(venue.minPrice)} · {t("market.max")} {money(venue.maxPrice)}
          </>
        ) : null}
        {venue.reportedOn ? ` · ${formatDate(venue.reportedOn)}` : null}
      </p>
    </li>
  );
}

function GroupSection({ group }: { group: VenueGroup }) {
  const { t } = useTranslation();
  const label =
    group.variety === null
      ? t("marketplace.varietyUnknown")
      : t("marketplace.varietyHeading", { variety: group.variety });
  return (
    <section>
      <h2 className="text-sm font-medium text-agri-mist">
        {label} ({group.venues.length})
      </h2>
      {group.grade ? (
        <p className="text-xs text-agri-muted">
          {t("market.grade")}: {group.grade}
        </p>
      ) : null}
      <ul className="mt-2 space-y-2">
        {group.venues.map((v, i) => (
          <VenueRow key={`${v.market}-${i}`} venue={v} />
        ))}
      </ul>
    </section>
  );
}

function OfficialChannels({ state }: { state: string }) {
  const { t } = useTranslation();
  const channels = channelsForState(state);
  // No verified channel for this state means no section at all — a
  // national placeholder would point a farmer somewhere that may not
  // serve them.
  if (channels.length === 0) return null;

  return (
    <section className="rounded-lg border bg-white/5 p-4">
      <h2 className="text-sm font-medium text-agri-mist">{t("marketplace.officialChannels")}</h2>
      <ul className="mt-2 space-y-2">
        {channels.map((c) => (
          <li key={c.catalogId}>
            <a
              href={c.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-agri-emerald underline"
            >
              {c.name}
            </a>
            <p className="text-xs text-agri-muted">
              {c.sourceName} · {t("marketplace.channelVerified", { date: formatDate(c.lastVerifiedOn) })}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function VenuesView({ data, asOf, source }: { data: MarketSnapshot; asOf: string; source: string }) {
  const { t } = useTranslation();
  const places = groupVenues(data);

  return (
    <div className="mt-4 space-y-4">
      <p className="rounded-lg border border-agri-amber/30 bg-agri-amber/10 p-3 text-sm text-agri-amber">
        {t("marketplace.disclaimer")}
      </p>

      {!places.hasVenues ? (
        <EmptyState
          message={t("marketplace.noVenues", {
            crop: data.commodity,
            district: data.district
          })}
        />
      ) : (
        <>
          <p className="text-sm text-agri-mist">
            {places.latestReportedOn === null
              ? t("marketplace.scopeNoDate", { crop: data.commodity, district: data.district })
              : t("marketplace.scope", {
                  crop: data.commodity,
                  district: data.district,
                  date: formatDate(places.latestReportedOn)
                })}
          </p>

          {places.groups.map((g) => (
            <GroupSection key={`${g.variety ?? ""}-${g.grade ?? ""}`} group={g} />
          ))}

          <p className="text-xs text-agri-muted">{t("marketplace.varietyNote")}</p>
        </>
      )}

      <OfficialChannels state={data.state} />

      <p className="text-xs text-agri-muted">
        {t("market.sourceNote", { source })}
        {` · ${t("market.fetchedAt", { time: new Date(asOf).toLocaleTimeString() })}`}
      </p>
      <p className="text-xs text-agri-muted">{t("marketplace.notADirectory")}</p>
    </div>
  );
}

export default function MarketplacePage() {
  const { t } = useTranslation();
  const { data: farms, isLoading: farmsLoading } = useFarms();
  const activeFarmId = useAppStore((s) => s.activeFarmId);
  const setActiveFarmId = useAppStore((s) => s.setActiveFarmId);
  const [selectedCropId, setSelectedCropId] = useState<string | null>(null);

  useEffect(() => {
    if (!activeFarmId && farms && farms.length > 0) setActiveFarmId(farms[0].id);
  }, [activeFarmId, farms, setActiveFarmId]);

  const activeFarm = farms?.find((f) => f.id === activeFarmId);
  const hasLocation = activeFarm?.state != null && activeFarm?.district != null;
  const { data: crops, isLoading: cropsLoading } = useFarmCrops(activeFarmId ?? undefined);

  useEffect(() => {
    if (crops && crops.length > 0) {
      if (!crops.some((c) => c.id === selectedCropId)) setSelectedCropId(crops[0].id);
    } else if (selectedCropId !== null) {
      setSelectedCropId(null);
    }
  }, [crops, selectedCropId]);

  const commodity = crops?.find((c) => c.id === selectedCropId)?.cropName ?? null;
  // Reuses the Market agent directly — same hook, same cache, no new
  // endpoint and no second request when both pages want the same crop.
  const { data: result, isLoading, isError } = useMarket(activeFarm, commodity);
  const canQuery = hasLocation && commodity !== null;

  return (
    <div className="p-6">
      <PageHero id="marketplace" titleKey="marketplace.title" descKey="agent.marketplace" />
      <p className="mt-1 text-sm text-agri-mist">{t("marketplace.intro")}</p>

      {farmsLoading ? <p className="mt-4 text-agri-muted">{t("common.loading")}</p> : null}

      {!farmsLoading && (!farms || farms.length === 0) ? (
        <div className="mt-4">
          <EmptyState message={t("marketplace.noFarm")} actionLabel={t("farms.add")} actionTo="/farms" />
        </div>
      ) : null}

      {!farmsLoading && farms && farms.length > 0 ? (
        <>
          <SelectorPanel id="marketplace">
            <label htmlFor="marketplace-farm-select" className="block text-xs font-semibold text-agri-muted">
              {t("soil.selectFarm")}
            </label>
            <select
              id="marketplace-farm-select"
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

          {/* Never substitute another district — say the farm has none. */}
          {activeFarm && !hasLocation ? (
            <div className="mt-4">
              <EmptyState
                message={t("marketplace.noLocation")}
                actionLabel={t("market.setLocation")}
                actionTo={`/farms/${activeFarm.id}`}
              />
            </div>
          ) : null}

          {activeFarm && hasLocation && !cropsLoading && (!crops || crops.length === 0) ? (
            <div className="mt-4">
              <EmptyState
                message={t("marketplace.noCrops")}
                actionLabel={t("market.addCrop")}
                actionTo={`/farms/${activeFarm.id}`}
              />
            </div>
          ) : null}

          {hasLocation && crops && crops.length > 0 ? (
            <SelectorPanel id="marketplace">
              <label htmlFor="marketplace-crop-select" className="block text-xs font-semibold text-agri-muted">
                {t("market.selectCrop")}
              </label>
              <select
                id="marketplace-crop-select"
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

          {canQuery && isLoading ? <p className="mt-4 text-agri-muted">{t("common.loading")}</p> : null}

          {canQuery && isError ? (
            <div className="mt-4">
              <DataUnavailable reason={t("marketplace.loadError")} />
            </div>
          ) : null}

          {canQuery && result && result.status === "unavailable" ? (
            <div className="mt-4">
              <DataUnavailable reason={result.reason} />
            </div>
          ) : null}

          {canQuery && result && result.status === "ok" ? (
            <VenuesView data={result.data} asOf={result.asOf} source={result.source} />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
