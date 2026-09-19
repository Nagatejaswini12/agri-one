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
    signOut
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
