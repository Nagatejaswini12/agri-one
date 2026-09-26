import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/auth/AuthProvider";
import { AuthLayout } from "@/auth/AuthLayout";
import { FullPageMessage } from "@/components/FullPageMessage";

/**
 * Requests a password recovery email.
 *
 * The confirmation message is deliberately the same whether or not the
 * address has an account: a different message for an unknown email would
 * turn this form into a way to find out who has registered.
 */
export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const { status, requestPasswordReset } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (status === "unconfigured") {
    return <FullPageMessage>{t("auth.unconfigured")}</FullPageMessage>;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const result = await requestPasswordReset(email);
    setPending(false);
    // A transport failure is worth showing; "no such user" is not
    // something Supabase reports here, by design.
    if (result.error) setError(result.error);
    else setSent(true);
  }

  if (sent) {
    return (
      <AuthLayout>
        <h1 className="text-lg font-semibold">{t("auth.resetLinkSentTitle")}</h1>
        <p className="mt-2 text-sm text-agri-mist">{t("auth.resetLinkSentBody")}</p>
        <p className="mt-4 text-center text-sm">
          <Link to="/sign-in" className="font-medium text-agri-emerald underline">
            {t("auth.backToSignIn")}
          </Link>
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <h1 className="text-lg font-semibold">{t("auth.forgotPasswordTitle")}</h1>
      <p className="mt-2 text-sm text-agri-mist">{t("auth.forgotPasswordBody")}</p>

      <form onSubmit={(e) => void handleSubmit(e)} className="mt-4 space-y-4">
        <div>
          <label htmlFor="forgot-email" className="block text-sm font-medium text-agri-mist">
            {t("auth.email")}
          </label>
          <input
            id="forgot-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="agri-field mt-1 w-full"
          />
        </div>

        {error ? <p className="text-sm text-agri-coral">{error}</p> : null}

        <button
          type="submit"
          disabled={pending}
          className="w-full agri-button"
        >
          {pending ? t("auth.sendingResetLink") : t("auth.sendResetLink")}
        </button>
      </form>

      <p className="mt-4 text-center text-sm">
        <Link to="/sign-in" className="font-medium text-agri-emerald underline">
          {t("auth.backToSignIn")}
        </Link>
      </p>
    </AuthLayout>
  );
}
