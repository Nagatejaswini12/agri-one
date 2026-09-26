import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { FarmCrop } from "@agri-one/shared-types";
import { useCreateYieldRecord } from "@/modules/reports/hooks";
import { YIELD_UNITS, todayIso } from "@/modules/reports/constants";

export function YieldForm({ farmId, crops }: { farmId: string; crops: FarmCrop[] }) {
  const { t } = useTranslation();
  const create = useCreateYieldRecord(farmId);

  const [cropId, setCropId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState<string>(YIELD_UNITS[0]);
  const [harvestedOn, setHarvestedOn] = useState(todayIso());
  const [error, setError] = useState<string | null>(null);

  // A harvest must belong to a crop, so default to the first available
  // and reset if the farm's crops change underneath.
  useEffect(() => {
    if (crops.length === 0) {
      if (cropId !== "") setCropId("");
      return;
    }
    if (!crops.some((c) => c.id === cropId)) setCropId(crops[0].id);
  }, [crops, cropId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = Number(quantity);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setError(t("reports.quantityInvalid"));
      return;
    }
    if (cropId === "") {
      setError(t("reports.cropRequired"));
      return;
    }

    try {
      await create.mutateAsync({ cropId, quantity: parsed, unit, harvestedOn });
      setQuantity("");
    } catch {
      setError(t("reports.saveError"));
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="mt-2 space-y-3 rounded-lg border bg-agri-bark p-4">
      <div>
        <label htmlFor="yield-crop" className="block text-xs font-semibold text-agri-muted">
          {t("reports.crop")}
        </label>
        <select
          id="yield-crop"
          value={cropId}
          onChange={(e) => setCropId(e.target.value)}
          className="agri-field mt-1 w-full"
        >
          {crops.map((c) => (
            <option key={c.id} value={c.id}>
              {c.cropName}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-3">
        <div className="flex-1">
          <label htmlFor="yield-quantity" className="block text-xs font-semibold text-agri-muted">
            {t("reports.quantity")}
          </label>
          <input
            id="yield-quantity"
            type="number"
            min="0"
            step="0.01"
            required
            inputMode="decimal"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="agri-field mt-1 w-full"
          />
        </div>
        <div className="flex-1">
          <label htmlFor="yield-unit" className="block text-xs font-semibold text-agri-muted">
            {t("reports.unit")}
          </label>
          <select
            id="yield-unit"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className="agri-field mt-1 w-full"
          >
            {YIELD_UNITS.map((u) => (
              <option key={u} value={u}>
                {t(`reports.unitName.${u}`)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="yield-date" className="block text-xs font-semibold text-agri-muted">
          {t("reports.harvestedOn")}
        </label>
        <input
          id="yield-date"
          type="date"
          required
          value={harvestedOn}
          onChange={(e) => setHarvestedOn(e.target.value)}
          className="agri-field mt-1 w-full"
        />
      </div>

      {error ? <p className="text-sm text-agri-coral">{error}</p> : null}

      <button
        type="submit"
        disabled={create.isPending || crops.length === 0}
        className="w-full agri-button"
      >
        {create.isPending ? t("common.saving") : t("reports.addHarvest")}
      </button>
    </form>
  );
}
