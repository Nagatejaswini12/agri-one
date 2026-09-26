import {
  OPEN_METEO_URL,
  mapOpenMeteo,
  openMeteoQuery,
  parseCoordinates
} from "../apps/web/src/modules/weather/openMeteo";

/**
 * The Weather Agent, served from this project instead of n8n.
 *
 * n8n Cloud is out of executions, which took live weather down with it.
 * Open-Meteo needs no key and no account, so the call moves here. The
 * n8n Weather workflow is left in place and untouched; nothing else was
 * migrated.
 *
 * The contract is deliberately identical to the webhook this replaces:
 * a POST carrying the farmer's Supabase bearer token and the selected
 * farm's coordinates, answered with `DataResult<WeatherSnapshot>`. The
 * Weather page therefore needed no redesign, and its loading, error,
 * unavailable and empty states all still work the same way.
 *
 * Runs on the edge runtime, which is the runtime whose handler
 * signature is the standard Request/Response pair — so this needs no
 * new dependency and no types package.
 */

export const config = { runtime: "edge" };

/** Mirrors the token check the n8n API workflow did before answering. */
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
  // Deliberately a 200 by default. `unavailable` is a normal, expected
  // answer in this contract rather than a transport failure, and the
  // client renders it as such.
  return new Response(JSON.stringify({ status: "unavailable", reason }), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return unavailable("Method not allowed.", 405);
  }

  // Reuses the values the project already has rather than asking for the
  // same two to be configured twice. Both are public by design — the
  // project URL and the publishable anon key, which ship in the browser
  // bundle regardless. No service-role key is used here, and none would
  // be correct: this endpoint verifies a farmer's own token, it never
  // acts on their behalf. The unprefixed names are accepted first so a
  // server-only pair can be introduced later without touching this file.
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return unavailable("The weather service is not configured.");
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
    return unavailable("The weather request could not be read.", 400);
  }

  const body = typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : {};
  const coords = parseCoordinates(body.latitude, body.longitude);
  // A farm with no usable location is never given another place's
  // weather. The page has its own empty state for this.
  if (!coords) return unavailable("This farm has no location set.", 400);

  let upstream: Response;
  try {
    upstream = await fetch(
      `${OPEN_METEO_URL}?${openMeteoQuery(coords.latitude, coords.longitude).toString()}`,
      { headers: { accept: "application/json" } }
    );
  } catch {
    return unavailable("The weather service is currently unavailable. Please try again.");
  }

  if (!upstream.ok) {
    // The farmer gets a plain message; the provider's own wording and
    // status stay in the function log so failures remain diagnosable
    // without leaking HTTP internals into the UI.
    console.error("Open-Meteo failure", upstream.status, await upstream.text().catch(() => ""));
    return unavailable("The weather service is currently unavailable. Please try again.");
  }

  let json: unknown;
  try {
    json = await upstream.json();
  } catch {
    return unavailable("The weather service returned an unreadable response.");
  }

  return new Response(JSON.stringify(mapOpenMeteo(json)), {
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}
