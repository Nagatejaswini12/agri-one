import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFarmerProfile, useUpdateFarmerProfile } from "@/modules/profile/hooks";
import { useAuth } from "@/auth/AuthProvider";

export default function ProfilePage() {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const { data: profile, isLoading, isError } = useFarmerProfile();
  const updateProfile = useUpdateFarmerProfile();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    setName(profile?.name ?? "");
    setPhone(profile?.phone ?? "");
  }, [profile?.name, profile?.phone]);

  const PHONE_PATTERN = /^[0-9+\-\s()]{7,15}$/;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setValidationError(null);
    const trimmedPhone = phone.trim();
    if (trimmedPhone && !PHONE_PATTERN.test(trimmedPhone)) {
      setValidationError(t("profile.phoneInvalid"));
      return;
    }
    await updateProfile.mutateAsync({ name: name.trim() || null, phone: trimmedPhone || null });
  }

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold">{t("profile.title")}</h1>

      {isLoading ? <p className="mt-4 text-agri-muted">{t("common.loading")}</p> : null}
      {isError ? <p className="mt-4 text-agri-coral">{t("profile.loadError")}</p> : null}

      {!isLoading && !isError ? (
        <form onSubmit={(e) => void handleSubmit(e)} className="mt-4 max-w-sm space-y-4">
          <div>
            <label className="block text-xs font-semibold text-agri-muted">{t("profile.email")}</label>
            <p className="mt-1 text-agri-mist">{user?.email}</p>
          </div>
          <div>
            <label htmlFor="profile-name" className="block text-xs font-semibold text-agri-muted">
              {t("profile.name")}
            </label>
            <input
              id="profile-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="agri-field mt-1 w-full"
            />
          </div>
          <div>
            <label htmlFor="profile-phone" className="block text-xs font-semibold text-agri-muted">
              {t("profile.phone")}
            </label>
            <input
              id="profile-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="agri-field mt-1 w-full"
            />
          </div>

          {validationError ? <p className="text-sm text-agri-coral">{validationError}</p> : null}
          {updateProfile.isError ? <p className="text-sm text-agri-coral">{t("profile.saveError")}</p> : null}
          {updateProfile.isSuccess ? <p className="text-sm text-agri-emerald">{t("profile.saved")}</p> : null}

          <button
            type="submit"
            disabled={updateProfile.isPending}
            className="agri-button"
          >
            {updateProfile.isPending ? t("common.saving") : t("common.save")}
          </button>
        </form>
      ) : null}

      <button
        type="button"
        onClick={() => void signOut()}
        className="mt-8 text-sm font-medium text-agri-coral underline"
      >
        {t("auth.signOut")}
      </button>
    </div>
  );
}
