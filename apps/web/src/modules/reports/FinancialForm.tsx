import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { FarmCrop } from "@agri-one/shared-types";
import { useCreateFinancialRecord } from "@/modules/reports/hooks";
import { COST_CATEGORIES, REVENUE_CATEGORIES, todayIso } from "@/modules/reports/constants";

export function FinancialForm({ farmId, crops }: { farmId: string; crops: FarmCrop[] }) {
  const { t } = useTranslation();
  const create = useCreateFinancialRecord(farmId);

  const [type, setType] = useState<"cost" | "revenue">("cost");
  const [category, setCategory] = useState<string>(COST_CATEGORIES[0]);
  const [amount, setAmount] = useState("");
  const [cropId, setCropId] = useState<string>("");
  const [recordedOn, setRecordedOn] = useState(todayIso());
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const categories = type === "cost" ? COST_CATEGORIES : REVENUE_CATEGORIES;

  function switchType(next: "cost" | "revenue") {
    setType(next);
    // The two lists don't overlap, so keep the selection valid.
    setCategory(next === "cost" ? COST_CATEGORIES[0] : REVENUE_CATEGORIES[0]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = Number(amount);
    // An unparseable or negative amount is rejected rather than coerced:
    // a silently-zeroed entry would be a fabricated number.
    if (!Number.isFinite(parsed) || parsed < 0) {
      setError(t("reports.amountInvalid"));
      return;
    }

    try {
      await create.mutateAsync({
        cropId: cropId === "" ? null : cropId,
        type,
        category,
        amount: parsed,
        quantity: null,
        unit: null,
        recordedOn,
        notes: notes.trim() === "" ? null : notes.trim()
      });
      setAmount("");
      setNotes("");
    } catch {
      setError(t("reports.saveError"));
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="mt-2 space-y-3 rounded-lg border bg-agri-bark p-4">
      <fieldset>
        <legend className="text-sm font-medium text-agri-mist">{t("reports.entryType")}</legend>
        <div className="mt-1 flex gap-4">
          {(["cost", "revenue"] as const).map((option) => (
            <label key={option} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="financial-type"
                value={option}
                checked={type === option}
                onChange={() => switchType(option)}
              />
              {t(`reports.type.${option}`)}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="financial-category" className="block text-xs font-semibold text-agri-muted">
          {t("reports.category_label")}
        </label>
        <select
          id="financial-category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="agri-field mt-1 w-full"
        >
          {categories.map((c) => (
            <option key={c} value={c}>
              {t(`reports.category.${c}`)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="financial-amount" className="block text-xs font-semibold text-agri-muted">
          {t("reports.amount")}
        </label>
        <input
          id="financial-amount"
          type="number"
          min="0"
          step="0.01"
          required
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="agri-field mt-1 w-full"
        />
      </div>

      <div>
        <label htmlFor="financial-crop" className="block text-xs font-semibold text-agri-muted">
          {t("reports.crop")}
        </label>
        <select
          id="financial-crop"
          value={cropId}
          onChange={(e) => setCropId(e.target.value)}
          className="agri-field mt-1 w-full"
        >
          {/* Farm-level entries belong to no single crop. */}
          <option value="">{t("reports.wholeFarm")}</option>
          {crops.map((c) => (
            <option key={c.id} value={c.id}>
              {c.cropName}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="financial-date" className="block text-xs font-semibold text-agri-muted">
          {t("reports.recordedOn")}
        </label>
        <input
          id="financial-date"
          type="date"
          required
          value={recordedOn}
          onChange={(e) => setRecordedOn(e.target.value)}
          className="agri-field mt-1 w-full"
        />
      </div>

      <div>
        <label htmlFor="financial-notes" className="block text-xs font-semibold text-agri-muted">
          {t("reports.notes")}
        </label>
        <input
          id="financial-notes"
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="agri-field mt-1 w-full"
        />
      </div>

      {error ? <p className="text-sm text-agri-coral">{error}</p> : null}

      <button
        type="submit"
        disabled={create.isPending}
        className="w-full agri-button"
      >
        {create.isPending ? t("common.saving") : t("reports.addEntry")}
      </button>
    </form>
  );
}
