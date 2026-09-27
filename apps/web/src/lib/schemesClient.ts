import type { DataResult } from "@agri-one/shared-types";
import { supabase } from "@/lib/supabaseClient";

/**
 * Calls this project's own /api/schemes instead of the n8n webhook.
 *
 * Same contract as `callAgentWebhook`, deliberately: the farmer's
 * Supabase JWT is forwarded as a bearer token, the response is
 * `DataResult<T>`, and any transport failure is normalised to the same
 * "unavailable" shape a source failure produces — so the Schemes page
 * renders one unavailable state either way and needed no change.
 *
 * Weather, Market and Schemes have moved. Crop Diagnosis, Voice, Chat
 * and the Orchestrator still go through `callAgentWebhook` to n8n.
 */
export async function callSchemesApi<T>(payload: unknown): Promise<DataResult<T>> {
  if (!supabase) {
    return { status: "unavailable", reason: "Supabase is not configured." };
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) {
    return { status: "unavailable", reason: "Not signed in." };
  }

  try {
    const res = await fetch("/api/schemes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });

    // The endpoint answers "unavailable" with a JSON body even on 4xx —
    // its own wording is more useful than a generic status message, and
    // it is what the page shows the farmer.
    const text = await res.text();
    if (text) {
      try {
        return JSON.parse(text) as DataResult<T>;
      } catch {
        // fall through to the status-based message below
      }
    }
    if (!res.ok) {
      return { status: "unavailable", reason: `Schemes request failed: ${res.status}` };
    }
    return { status: "unavailable", reason: "The schemes service returned an empty response." };
  } catch {
    return { status: "unavailable", reason: "Could not reach the schemes service." };
  }
}
