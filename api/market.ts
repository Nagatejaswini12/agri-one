import {
  AGMARKNET_URL,
  agmarknetQuery,
  mapAgmarknet,
  resolveLocation
} from "../apps/web/src/modules/market/agmarknet";

/**
 * The Market Agent, served from this project instead of n8n.
 *
 * n8n Cloud is out of executions, which took live mandi prices down with
 * it. The data source does not change: this calls the same official
 * AGMARKNET resource on data.gov.in that the n8n workflow called. The
 * n8n Market workflow is left in place and untouched, as are the other
 * agents.
 *
 * The contract is deliberately identical to the webhook it replaces: a
 * POST carrying the farmer's Supabase bearer token plus the farm's
 * state, district and the selected crop, answered with
 * `DataResult<MarketSnapshot>`. The Market page needed no redesign and
 * its loading, error, unavailable and empty states all still apply.
 *
 * The data.gov.in key is read from the server environment and never
 * leaves it — it is not VITE_-prefixed, so it cannot reach the browser
 * bundle, and it is never echoed in a response or an error.
 *
 * Runs on the edge runtime, whose handler signature is the standard
 * Request/Response pair, so this needs no new dependency.
 */

export const config = { runtime: "edge" };

async function isSignedIn(token: string, supabaseUrl: string, anonKey: string): Promise<boolean> {
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: anonKey }
    });
    return res.ok;
  } catch {
    return false;
  }
}

function unavailable(reason: string, status = 200): Response {
  // A 200 by default: "unavailable" is a normal, expected answer in this
  // contract rather than a transport failure, and the page renders it so.
  return new Response(JSON.stringify({ status: "unavailable", reason }), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return unavailable("Method not allowed.", 405);
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return unavailable("The market price service is not configured.");
  }

  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return unavailable("Not signed in.", 401);
  if (!(await isSignedIn(token, supabaseUrl, anonKey))) {
    return unavailable("Not signed in.", 401);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return unavailable("The market request could not be read.", 400);
  }

  const body = typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : {};

  // The farmer's own spellings are mapped onto AGMARKNET's before any
  // request is made. An unresolvable district is refused with a message
  // naming what was searched for — substituting a nearby district would
  // show another market's prices as if they were this farmer's.
  const resolved = resolveLocation(body.state, body.district, body.commodity);
  if (!resolved.resolved) {
    return unavailable(
      resolved.reason ?? "The farm's location could not be matched to a market district.",
      resolved.reasonKey === "commodity" ? 400 : 200
    );
  }

  // Checked here rather than earlier: resolution is local logic that
  // needs no key, and a farmer whose district has a typo must get the
  // message naming it, not a configuration error. Still after
  // authentication, so an anonymous caller cannot probe the setup.
  const apiKey = process.env.DATA_GOV_IN_API_KEY;
  if (!apiKey) {
    console.error("DATA_GOV_IN_API_KEY is not set; market lookups cannot run.");
    return unavailable("The market price service is not configured.");
  }

  const query = agmarknetQuery(resolved);
  query.set("api-key", apiKey);

  let upstream: Response;
  try {
    upstream = await fetch(`${AGMARKNET_URL}?${query.toString()}`, {
      headers: { accept: "application/json" }
    });
  } catch {
    return unavailable("The market price service is currently unavailable. Please try again.");
  }

  if (!upstream.ok) {
    // The provider's own wording and status stay in the function log so
    // failures remain diagnosable. The response body can echo the query
    // string, so it is never forwarded to the browser.
    console.error("AGMARKNET failure", upstream.status, (await upstream.text().catch(() => "")).slice(0, 400));
    return unavailable("The market price service is currently unavailable. Please try again.");
  }

  let json: unknown;
  try {
    json = await upstream.json();
  } catch {
    return unavailable("The market price service returned an unreadable response.");
  }

  return new Response(JSON.stringify(mapAgmarknet(json, resolved)), {
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}
