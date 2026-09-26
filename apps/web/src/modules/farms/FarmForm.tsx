import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { FarmInput } from "@/modules/farms/hooks";

const emptyInput: FarmInput = {
  name: "",
  latitude: null,
  longitude: null,
  state: null,
  district: null,
  areaAcres: null
};

export function FarmForm({
  initial,
  onSubmit,
  pending,
  submitLabel
}: {
  initial?: FarmInput;
  onSubmit: (input: FarmInput) => Promise<void>;
  pending: boolean;
  submitLabel: string;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<FarmInput>(initial ?? emptyInput);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function useCurrentLocation() {
    if (!("geolocation" in navigator)) {
      setLocationError(t("farms.locationUnsupported"));
      return;
    }
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setForm((f) => ({
          ...f,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        }));
      },
      () => setLocationError(t("farms.locationDenied"))
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) {
      setError(t("farms.nameRequired"));
      return;
    }
    await onSubmit({ ...form, name: form.name.trim() });
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      <div>
        <label htmlFor="farm-name" className="block text-xs font-semibold text-agri-muted">
          {t("farms.name")}
        </label>
        <input
          id="farm-name"
          type="text"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          className="agri-field mt-1 w-full"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="farm-state" className="block text-xs font-semibold text-agri-muted">
            {t("farms.state")}
          </label>
          <input
            id="farm-state"
            type="text"
            value={form.state ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, state: e.target.value || null }))}
            className="agri-field mt-1 w-full"
          />
        </div>
        <div>
          <label htmlFor="farm-district" className="block text-xs font-semibold text-agri-muted">
            {t("farms.district")}
          </label>
          <input
            id="farm-district"
            type="text"
            value={form.district ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, district: e.target.value || null }))}
            className="agri-field mt-1 w-full"
          />
        </div>
      </div>

      <div>
        <label htmlFor="farm-area" className="block text-xs font-semibold text-agri-muted">
          {t("farms.areaAcres")}
        </label>
        <input
          id="farm-area"
          type="number"
          min="0"
          step="0.01"
          value={form.areaAcres ?? ""}
          onChange={(e) => setForm((f) => ({ ...f, areaAcres: e.target.value ? Number(e.target.value) : null }))}
          className="agri-field mt-1 w-full"
        />
      </div>

      <div>
        <span className="block text-xs font-semibold text-agri-muted">{t("farms.location")}</span>
        <p className="mt-1 text-sm text-agri-mist">
          {form.latitude !== null && form.longitude !== null
            ? `${form.latitude.toFixed(5)}, ${form.longitude.toFixed(5)}`
            : t("farms.locationNotSet")}
        </p>
        <button
          type="button"
          onClick={useCurrentLocation}
          className="mt-2 rounded border px-3 py-1.5 text-sm font-medium text-agri-emerald"
        >
          {t("farms.useCurrentLocation")}
        </button>
        {locationError ? <p className="mt-1 text-sm text-agri-coral">{locationError}</p> : null}
      </div>

      {error ? <p className="text-sm text-agri-coral">{error}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="agri-button"
      >
        {pending ? t("common.saving") : submitLabel}
      </button>
    </form>
  );
}
