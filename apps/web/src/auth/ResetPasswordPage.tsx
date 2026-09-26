import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/auth/AuthProvider";
import { AuthLayout } from "@/auth/AuthLayout";
import { FullPageMessage } from "@/components/FullPageMessage";

/** Supabase's own minimum; stated up front rather than only on failure. */
const MIN_PASSWORD_LENGTH = 6;

/**
 * Sets a new password from a recovery link.
 *
 * Opening the link gives supabase-js a short-lived recovery session,
 * which it establishes from the URL itself — this page never reads,
 * stores or forwards the token. A public route on purpose: the visitor
 * is mid-recovery, so RequireAuth would bounce them to sign-in, which is
 * exactly where they cannot go.
 *
 * On success the recovery session is ended, so the new password has to
 * actually work before the farmer is back in the app.
 */
export default function ResetPasswordPage() {
  const { t } = useTranslation();
  const { status, updatePassword, signOut } = useAuth();
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  // supabase-js consumes the token from the URL asynchronously, so a
  // "no session" verdict is only trustworthy once loading has settled.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (status !== "loading") {
      const timer = setTimeout(() => setSettled(true), 400);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [status]);

  if (status === "unconfigured") {
    return <FullPageMessage>{t("auth.unconfigured")}</FullPageMessage>;
  }
  if (status === "loading" || !settled) {
    return <FullPageMessage>{t("auth.loading")}</FullPageMessage>;
  }

  if (done) {
    return (
      <AuthLayout>
        <h1 className="text-lg font-semibold">{t("auth.passwordUpdatedTitle")}</h1>
        <p className="mt-2 text-sm text-agri-mist">{t("auth.passwordUpdatedBody")}</p>
        <p className="mt-4 text-center text-sm">
          <Link to="/sign-in" className="font-medium text-agri-emerald underline">
            {t("auth.backToSignIn")}
          </Link>
        </p>
      </AuthLayout>
    );
  }

  // No session here means the link was never opened, has expired, or was
  // already used. Say so plainly and offer a fresh one.
  if (status === "signed-out") {
    return (
      <AuthLayout>
        <h1 className="text-lg font-semibold">{t("auth.recoveryInvalidTitle")}</h1>
        <p className="mt-2 text-sm text-agri-mist">{t("auth.recoveryInvalidBody")}</p>
        <p className="mt-4 text-center text-sm">
          <Link to="/forgot-password" className="font-medium text-agri-emerald underline">
            {t("auth.requestNewLink")}
          </Link>
        </p>
      </AuthLayout>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(t("auth.passwordTooShort", { count: MIN_PASSWORD_LENGTH }));
      return;
    }
    if (password !== confirm) {
      setError(t("auth.passwordsDoNotMatch"));
      return;
    }

    setPending(true);
    const result = await updatePassword(password);
    if (result.error) {
      setPending(false);
      setError(result.error);
      return;
    }

    // End the recovery session so the next sign-in proves the new
    // password works, rather than silently riding the recovery session.
    await signOut();
    setPending(false);
    setDone(true);
    navigate("/reset-password", { replace: true });
  }

  return (
    <AuthLayout>
      <h1 className="text-lg font-semibold">{t("auth.resetPasswordTitle")}</h1>
      <p className="mt-2 text-sm text-agri-mist">{t("auth.resetPasswordBody")}</p>

      <form onSubmit={(e) => void handleSubmit(e)} className="mt-4 space-y-4">
        <div>
          <label htmlFor="reset-password" className="block text-sm font-medium text-agri-mist">
            {t("auth.newPassword")}
          </label>
          <input
            id="reset-password"
            type="password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="agri-field mt-1 w-full"
          />
        </div>
        <div>
          <label htmlFor="reset-confirm" className="block text-sm font-medium text-agri-mist">
            {t("auth.confirmPassword")}
          </label>
          <input
            id="reset-confirm"
            type="password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="agri-field mt-1 w-full"
          />
        </div>

        {error ? <p className="text-sm text-agri-coral">{error}</p> : null}

        <button
          type="submit"
          disabled={pending}
          className="w-full agri-button"
        >
          {pending ? t("auth.updatingPassword") : t("auth.updatePassword")}
        </button>
      </form>
    </AuthLayout>
  );
}
