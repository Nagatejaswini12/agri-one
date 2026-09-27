import {
  ROBOFLOW_URL,
  diagnosisUnavailable,
  mapRoboflow
} from "../apps/web/src/modules/scan-crop/roboflow";

/**
 * The Crop Diagnosis Agent, served from this project instead of n8n.
 *
 * n8n Cloud is out of executions. The vision provider does not change:
 * this calls the same Roboflow serverless model the n8n workflow called
 * (crop-disease-axhjj/1). The n8n workflow is left in place and
 * untouched as a rollback copy.
 *
 * What stays in the browser, deliberately: the Storage upload and the
 * scans row. Both are the farmer's own authenticated Supabase work,
 * protected by row-level security, and moving them here would mean this
 * function holding a Storage or database credential it has no business
 * holding. It receives a short-lived signed URL and nothing more — it
 * never sees the image bytes, the farm id or the farmer's data.
 *
 * The Roboflow key is read from the server environment as
 * ROBOFLOW_API_KEY. It is not VITE_-prefixed, so it cannot reach the
 * browser bundle, and it is never echoed in a response — Roboflow's own
 * error body can contain the request URL, so that is logged and not
 * forwarded.
 *
 * Runs on the edge runtime, whose handler signature is the standard
 * Request/Response pair, so this needs no new dependency.
 */

export const config = { runtime: "edge" };

/** Roboflow fetches the image itself, so the call must not hang forever. */
const ROBOFLOW_TIMEOUT_MS = 30000;

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
  return new Response(JSON.stringify(diagnosisUnavailable(reason)), {
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
    return unavailable("The diagnosis service is not configured.");
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
    return unavailable("The diagnosis request could not be read.", 400);
  }

  const body = typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : {};
  const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";
  const cropName = typeof body.cropName === "string" && body.cropName.trim() ? body.cropName.trim() : null;

  // Only http(s) is ever forwarded to the provider. Without this the
  // endpoint would hand an arbitrary caller-supplied string to Roboflow
  // to fetch on our behalf.
  if (!/^https:\/\//.test(imageUrl)) {
    return unavailable("No usable image was supplied for diagnosis.", 400);
  }

  // Checked after authentication and after the input is validated, so an
  // anonymous or malformed caller cannot probe whether the key is set.
  const apiKey = process.env.ROBOFLOW_API_KEY;
  if (!apiKey) {
    console.error("ROBOFLOW_API_KEY is not set; crop diagnosis cannot run.");
    return unavailable("The diagnosis service is not configured.");
  }

  // The image is passed to Roboflow by URL and Roboflow fetches it
  // itself; there is no request body. An earlier n8n version uploaded
  // the bytes as well, and Roboflow silently ignored the upload in
  // favour of the URL — so sending both is dead work, not redundancy.
  const url = new URL(ROBOFLOW_URL);
  url.searchParams.set("image", imageUrl);
  url.searchParams.set("api_key", apiKey);

  let upstream: Response;
  try {
    upstream = await fetch(url.toString(), {
      method: "POST",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(ROBOFLOW_TIMEOUT_MS)
    });
  } catch {
    return unavailable("The diagnosis service is currently unavailable. Please try again.");
  }

  if (!upstream.ok) {
    // The provider's wording and status stay in the function log so
    // failures remain diagnosable. The body can echo the request URL,
    // which carries the key, so it is never forwarded to the browser.
    console.error("Roboflow failure", upstream.status, (await upstream.text().catch(() => "")).slice(0, 300));
    // A 4xx here usually means Roboflow could not decode the image —
    // some hosts block automated fetchers — rather than a service
    // outage, but either way no diagnosis was produced.
    return unavailable("The diagnosis service is currently unavailable. Please try again.");
  }

  let json: unknown;
  try {
    json = await upstream.json();
  } catch {
    return unavailable("The diagnosis service returned an unreadable response.");
  }

  return new Response(JSON.stringify(mapRoboflow(json, cropName)), {
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}
