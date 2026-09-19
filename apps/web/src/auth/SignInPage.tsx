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
          <label htmlFor="signin-email" className="block text-sm font-medium text-gray-700">
            {t("auth.email")}
          </label>
          <input
            id="signin-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded border px-3 py-2"
          />
        </div>
        <div>
          <label htmlFor="signin-password" className="block text-sm font-medium text-gray-700">
            {t("auth.password")}
          </label>
          <input
            id="signin-password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded border px-3 py-2"
          />
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded bg-green-700 px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          {pending ? t("auth.signingIn") : t("auth.signIn")}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-gray-600">
        {t("auth.noAccount")}{" "}
        <Link to="/sign-up" className="font-medium text-green-700 underline">
          {t("auth.signUp")}
        </Link>
      </p>
    </AuthLayout>
  );
}
