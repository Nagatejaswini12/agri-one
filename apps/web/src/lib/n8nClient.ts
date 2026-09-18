import type { DataResult } from "@agri-one/shared-types";
import { supabase } from "@/lib/supabaseClient";

const N8N_BASE_URL = import.meta.env.VITE_N8N_BASE_URL ?? "http://localhost:5678";

/**
 * Calls an n8n webhook directly (no backend in between — see
 * docs/architecture.md). The farmer's Supabase JWT is forwarded as the
 * bearer token; the receiving workflow verifies it before doing anything
 * farm-specific. Every agent workflow must return the DataResult<T>
 * shape, so a network/auth failure here is normalized to the same
 * "unavailable" shape a live-data source failure would produce —
 * callers render one unavailable state either way.
 */
export async function callAgentWebhook<T>(
  webhookPath: string,
  payload: unknown
): Promise<DataResult<T>> {
  if (!supabase) {
    return { status: "unavailable", reason: "Supabase is not configured." };
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) {
    return { status: "unavailable", reason: "Not signed in." };
  }

  try {
    const res = await fetch(`${N8N_BASE_URL}/webhook/${webhookPath}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      return { status: "unavailable", reason: `Agent request failed: ${res.status}` };
    }
    return (await res.json()) as DataResult<T>;
  } catch {
    return { status: "unavailable", reason: "Could not reach the agent service." };
  }
}
