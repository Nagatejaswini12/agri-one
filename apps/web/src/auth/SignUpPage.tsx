import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/auth/AuthProvider";
import { useAppStore } from "@/stores/useAppStore";
import { AuthLayout } from "@/auth/AuthLayout";
import { FullPageMessage } from "@/components/FullPageMessage";

export default function SignUpPage() {
  const { t } = useTranslation();
  const { status, signUpWithPassword } = useAuth();
  const language = useAppStore((s) => s.language);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);

  if (status === "unconfigured") {
    return <FullPageMessage>{t("auth.unconfigured")}</FullPageMessage>;
  }
  if (status === "signed-in") {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const result = await signUpWithPassword(email, password, language);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.needsEmailConfirmation) {
      setConfirmationSent(true);
    }
  }

  if (confirmationSent) {
    return (
      <AuthLayout>
        <h1 className="text-lg font-semibold">{t("auth.checkEmailTitle")}</h1>
        <p className="mt-2 text-gray-600">{t("auth.checkEmailBody")}</p>
        <Link to="/sign-in" className="mt-4 inline-block font-medium text-green-700 underline">
          {t("auth.signIn")}
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <h1 className="text-lg font-semibold">{t("auth.signUp")}</h1>
      <form onSubmit={(e) => void handleSubmit(e)} className="mt-4 space-y-4">
        <div>
          <label htmlFor="signup-email" className="block text-sm font-medium text-gray-700">
            {t("auth.email")}
          </label>
          <input
            id="signup-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded border px-3 py-2"
          />
        </div>
        <div>
          <label htmlFor="signup-password" className="block text-sm font-medium text-gray-700">
            {t("auth.password")}
          </label>
          <input
            id="signup-password"
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
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
          {pending ? t("auth.signingUp") : t("auth.signUp")}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-gray-600">
        {t("auth.haveAccount")}{" "}
        <Link to="/sign-in" className="font-medium text-green-700 underline">
          {t("auth.signIn")}
        </Link>
      </p>
    </AuthLayout>
  );
}
