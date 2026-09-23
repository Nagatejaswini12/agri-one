import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import type { SupportedLanguage } from "@agri-one/shared-types";
import { supabase } from "@/lib/supabaseClient";

export type AuthStatus = "loading" | "unconfigured" | "signed-out" | "signed-in";

interface SignResult {
  error: string | null;
  /** true when Supabase requires email confirmation before a session exists. */
  needsEmailConfirmation?: boolean;
}

interface AuthContextValue {
  status: AuthStatus;
  session: Session | null;
  user: User | null;
  signInWithPassword: (email: string, password: string) => Promise<SignResult>;
  signUpWithPassword: (
    email: string,
    password: string,
    preferredLanguage: SupportedLanguage
  ) => Promise<SignResult>;
  signOut: () => Promise<void>;
  /** Emails a recovery link. Never reveals whether the address exists. */
  requestPasswordReset: (email: string) => Promise<SignResult>;
  /** Sets a new password for the current session (normal or recovery). */
  updatePassword: (password: string) => Promise<SignResult>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(supabase ? "loading" : "unconfigured");
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    if (!supabase) return;

    let isMounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      setSession(data.session);
      setStatus(data.session ? "signed-in" : "signed-out");
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setStatus(nextSession ? "signed-in" : "signed-out");
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function signInWithPassword(email: string, password: string): Promise<SignResult> {
    if (!supabase) return { error: "Supabase is not configured." };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }

  async function signUpWithPassword(
    email: string,
    password: string,
    preferredLanguage: SupportedLanguage
  ): Promise<SignResult> {
    if (!supabase) return { error: "Supabase is not configured." };
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { preferred_language: preferredLanguage } }
    });
    if (error) return { error: error.message };
    return { error: null, needsEmailConfirmation: !data.session };
  }

  /**
   * Sends the recovery email. Supabase returns success whether or not the
   * address has an account, and this passes that through unchanged: a
   * different response for a missing account would turn the form into a
   * way to discover who has registered.
   *
   * redirectTo is built from the running origin, so a link opened from
   * the dev server lands on the dev server.
   */
  async function requestPasswordReset(email: string): Promise<SignResult> {
    if (!supabase) return { error: "Supabase is not configured." };
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`
    });
    return { error: error?.message ?? null };
  }

  /**
   * Works with whatever session is current. After a recovery link that is
   * the temporary recovery session Supabase established from the URL;
   * signed in normally it is the ordinary session. The token itself is
   * never read or stored by this app — supabase-js consumes it from the
   * URL and keeps it internally.
   */
  async function updatePassword(password: string): Promise<SignResult> {
    if (!supabase) return { error: "Supabase is not configured." };
    const { error } = await supabase.auth.updateUser({ password });
    return { error: error?.message ?? null };
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
  }

  const value: AuthContextValue = {
    status,
    session,
    user: session?.user ?? null,
    signInWithPassword,
    signUpWithPassword,
    signOut,
    requestPasswordReset,
    updatePassword
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
