import type { DataResult } from "@agri-one/shared-types";
import { orchestrate, type AgentCallers } from "../apps/web/src/modules/dashboard/orchestrate";
import {
  applyRules,
  briefingUnavailable,
  buildBriefing,
  isUsable,
  type BriefingContext
} from "../apps/web/src/modules/dashboard/decisionRules";
import {
  OPEN_METEO_URL,
  mapOpenMeteo,
  openMeteoQuery,
  parseCoordinates
} from "../apps/web/src/modules/weather/openMeteo";
import {
  AGMARKNET_URL,
  agmarknetQuery,
  mapAgmarknet,
  resolveLocation
} from "../apps/web/src/modules/market/agmarknet";
import { matchSchemes } from "../apps/web/src/modules/schemes/schemeMatching";
import { CATALOG, CATALOG_VERSION } from "../apps/web/src/modules/schemes/catalog";

/**
 * The Orchestrator, served from this project instead of n8n.
 *
 * The three agents it consults were already migrated, so they are called
 * as functions in this process rather than over HTTP. That removes n8n's
 * three sub-workflow invocations entirely: the only outbound requests
 * are the two the agents themselves make — Open-Meteo and data.gov.in —
 * and Schemes makes none at all. No new external API and no new secret.
 *
 * The n8n Orchestrator, Decision, Weather, Market and Schemes workflows
 * are all left in place and untouched as rollback copies.
 *
 * Nothing here reads Supabase. Everything about the farm arrives in the
 * request, already scoped to the signed-in farmer by row-level security
 * on the frontend's own queries, so this holds no database credential.
 * The projection boundary is re-applied here: a disease label or a soil
 * chemistry value is dropped even if a caller sends one.
 *
 * Runs on the edge runtime, whose handler signature is the standard
 * Request/Response pair, so this needs no new dependency.
 */

export const config = { runtime: "edge" };

const AGENT_TIMEOUT_MS = 20000;

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
  return new Response(JSON.stringify({ status: "unavailable", reason }), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}

/**
 * Weather, called exactly as /api/weather calls it.
 *
 * Readiness already guaranteed coordinates, but they are re-validated
 * rather than trusted: a farm with an unusable location is never given
 * another place's weather.
 */
async function weatherAgent(ctx: BriefingContext): Promise<DataResult<unknown>> {
  const coords = parseCoordinates(ctx.latitude, ctx.longitude);
  if (!coords) return { status: "unavailable", reason: "This farm has no location set." };
  const res = await fetch(
    `${OPEN_METEO_URL}?${openMeteoQuery(coords.latitude, coords.longitude).toString()}`,
    { headers: { accept: "application/json" }, signal: AbortSignal.timeout(AGENT_TIMEOUT_MS) }
  );
  if (!res.ok) {
    console.error("Orchestrator: Open-Meteo failure", res.status);
    return { status: "unavailable", reason: "The weather service is currently unavailable." };
  }
  return mapOpenMeteo(await res.json());
}

/**
 * Market, called exactly as /api/market calls it.
 *
 * DATA_GOV_IN_API_KEY may not be configured. That produces an honest
 * unavailable signal — never a fabricated price — and the briefing is
 * still built from whatever else succeeded.
 */
async function marketAgent(ctx: BriefingContext): Promise<DataResult<unknown>> {
  const resolved = resolveLocation(ctx.state, ctx.district, ctx.primaryCrop);
  if (!resolved.resolved) {
    return {
      status: "unavailable",
      reason: resolved.reason ?? "The farm's location could not be matched to a market district."
    };
  }
  const apiKey = process.env.DATA_GOV_IN_API_KEY;
  if (!apiKey) {
    console.error("Orchestrator: DATA_GOV_IN_API_KEY is not set; market signal unavailable.");
    return { status: "unavailable", reason: "The market price service is not configured." };
  }
  const query = agmarknetQuery(resolved);
  query.set("api-key", apiKey);
  const res = await fetch(`${AGMARKNET_URL}?${query.toString()}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(AGENT_TIMEOUT_MS)
  });
  if (!res.ok) {
    // The provider's body can echo the query string, which carries the
    // key, so only the status is logged.
    console.error("Orchestrator: AGMARKNET failure", res.status);
    return { status: "unavailable", reason: "The market price service is currently unavailable." };
  }
  return mapAgmarknet(await res.json(), resolved);
}

/** Schemes, called exactly as /api/schemes calls it. Makes no network call. */
async function schemesAgent(ctx: BriefingContext): Promise<DataResult<unknown>> {
  return matchSchemes(
    { state: ctx.state, district: ctx.district, areaAcres: ctx.areaAcres, crops: ctx.crops, locale: ctx.locale },
    () => new Date(),
    CATALOG,
    CATALOG_VERSION
  );
}

const AGENTS: AgentCallers = {
  weather: weatherAgent,
  market: marketAgent,
  schemes: schemesAgent
};

const RULES = { applyRules, buildBriefing, briefingUnavailable, isUsable };

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return unavailable("Method not allowed.", 405);
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return unavailable("The briefing service is not configured.");
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
    return unavailable("The briefing request could not be read.", 400);
  }

  const body = typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : {};

  // A farm with no coordinates, no district or no crops is not an error:
  // readiness gates each agent separately and the farm-record rules state
  // the reason where the farmer can act on it.
  return new Response(JSON.stringify(await orchestrate(body, AGENTS, RULES)), {
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}
