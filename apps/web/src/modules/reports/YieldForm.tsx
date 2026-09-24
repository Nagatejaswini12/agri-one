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
    <form onSubmit={(e) => void handleSubmit(e)} className="mt-2 space-y-3 rounded-lg border bg-white p-4">
      <div>
        <label htmlFor="yield-crop" className="block text-sm font-medium text-gray-700">
          {t("reports.crop")}
        </label>
        <select
          id="yield-crop"
          value={cropId}
          onChange={(e) => setCropId(e.target.value)}
          className="mt-1 w-full rounded border px-3 py-2"
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
          <label htmlFor="yield-quantity" className="block text-sm font-medium text-gray-700">
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
            className="mt-1 w-full rounded border px-3 py-2"
          />
        </div>
        <div className="flex-1">
          <label htmlFor="yield-unit" className="block text-sm font-medium text-gray-700">
            {t("reports.unit")}
          </label>
          <select
            id="yield-unit"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className="mt-1 w-full rounded border px-3 py-2"
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
        <label htmlFor="yield-date" className="block text-sm font-medium text-gray-700">
          {t("reports.harvestedOn")}
        </label>
        <input
          id="yield-date"
          type="date"
          required
          value={harvestedOn}
          onChange={(e) => setHarvestedOn(e.target.value)}
          className="mt-1 w-full rounded border px-3 py-2"
        />
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <button
        type="submit"
        disabled={create.isPending || crops.length === 0}
        className="w-full rounded bg-green-700 px-4 py-2 font-medium text-white disabled:opacity-50"
      >
        {create.isPending ? t("common.saving") : t("reports.addHarvest")}
      </button>
    </form>
  );
}
