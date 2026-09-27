import { CATALOG, CATALOG_VERSION } from "../apps/web/src/modules/schemes/catalog";
import { matchSchemes } from "../apps/web/src/modules/schemes/schemeMatching";

/**
 * The Government Schemes Agent, served from this project instead of n8n.
 *
 * Unlike Weather and Market, nothing external is being re-pointed here:
 * the n8n workflow made no data call either. There is no public API for
 * Indian scheme eligibility — myScheme's own endpoint returns 401 to
 * anyone outside its portal, and data.gov.in publishes scheme budget and
 * beneficiary tables rather than eligibility rules. The catalog is
 * curated by hand, and this move puts it somewhere it can actually be
 * reviewed in a diff instead of inside an escaped string in workflow
 * JSON. The n8n workflow is left in place and untouched as a rollback
 * copy.
 *
 * This endpoint therefore makes exactly one external request — the
 * Supabase token check — and no other.
 *
 * The contract is deliberately identical to the webhook it replaces: a
 * POST carrying the farmer's bearer token plus state, district,
 * areaAcres, crops and locale, answered with
 * `DataResult<SchemeMatchResult>`. The Schemes page was not touched.
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

  // Reuses the values the project already has. No new environment
  // variable is introduced, and no secret is involved: the catalog ships
  // with the code.
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return unavailable("The schemes service is not configured.");
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
    return unavailable("The schemes request could not be read.", 400);
  }

  const body = typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : {};

  // A farm with no saved state is not an error: central schemes apply
  // nationwide, so there is still something true to show, and the result
  // reports how many state schemes could not be considered.
  return new Response(
    JSON.stringify(
      matchSchemes({
        state: body.state,
        district: body.district,
        areaAcres: body.areaAcres,
        crops: body.crops,
        locale: body.locale
      }, () => new Date(), CATALOG, CATALOG_VERSION)
    ),
    { headers: { "content-type": "application/json", "cache-control": "no-store" } }
  );
}
