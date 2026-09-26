import { useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/auth/AuthProvider";
import { AuthLayout } from "@/auth/AuthLayout";
import { FullPageMessage } from "@/components/FullPageMessage";

export default function SignInPage() {
  const { t } = useTranslation();
  const { status, signInWithPassword } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (status === "unconfigured") {
    return <FullPageMessage>{t("auth.unconfigured")}</FullPageMessage>;
  }
  if (status === "signed-in") {
    const redirectTo = (location.state as { from?: string } | null)?.from ?? "/";
    return <Navigate to={redirectTo} replace />;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const result = await signInWithPassword(email, password);
    setPending(false);
    if (result.error) setError(result.error);
  }

  return (
    <AuthLayout>
      <h1 className="text-lg font-semibold">{t("auth.signIn")}</h1>
      <form onSubmit={(e) => void handleSubmit(e)} className="mt-4 space-y-4">
        <div>
          <label htmlFor="signin-email" className="block text-sm font-medium text-agri-mist">
            {t("auth.email")}
          </label>
          <input
            id="signin-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="agri-field mt-1 w-full"
          />
        </div>
        <div>
          <label htmlFor="signin-password" className="block text-sm font-medium text-agri-mist">
            {t("auth.password")}
          </label>
          <input
            id="signin-password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="agri-field mt-1 w-full"
          />
        </div>

        {error ? <p className="text-sm text-agri-coral">{error}</p> : null}

        <button
          type="submit"
          disabled={pending}
          className="w-full agri-button"
        >
          {pending ? t("auth.signingIn") : t("auth.signIn")}
        </button>
      </form>
      <p className="mt-4 text-center text-sm">
        <Link to="/forgot-password" className="font-medium text-agri-emerald underline">
          {t("auth.forgotPassword")}
        </Link>
      </p>
      <p className="mt-2 text-center text-sm text-agri-mist">
        {t("auth.noAccount")}{" "}
        <Link to="/sign-up" className="font-medium text-agri-emerald underline">
          {t("auth.signUp")}
        </Link>
      </p>
    </AuthLayout>
  );
}
