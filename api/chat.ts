import type { DataResult } from "@agri-one/shared-types";
import { classifyIntent } from "../apps/web/src/modules/voice-ai/classifyIntent";
import { buildAnswer, type ChatBranches } from "../apps/web/src/modules/voice-ai/buildAnswer";
import { orchestrate } from "../apps/web/src/modules/dashboard/orchestrate";
import {
  applyRules, briefingUnavailable, buildBriefing, isUsable
} from "../apps/web/src/modules/dashboard/decisionRules";
import {
  OPEN_METEO_URL, mapOpenMeteo, openMeteoQuery, parseCoordinates
} from "../apps/web/src/modules/weather/openMeteo";
import {
  AGMARKNET_URL, agmarknetQuery, mapAgmarknet, resolveLocation
} from "../apps/web/src/modules/market/agmarknet";
import { matchSchemes } from "../apps/web/src/modules/schemes/schemeMatching";
import { CATALOG, CATALOG_VERSION } from "../apps/web/src/modules/schemes/catalog";

/**
 * The Chat / Voice AI agent, served from this project instead of n8n.
 *
 * The last agent to move. Like the Orchestrator, everything it consults
 * was already migrated, so the four routes are called as functions in
 * this process rather than fanning out to n8n sub-workflows. No new
 * external API and no new secret.
 *
 * Language is untouched by this migration. The classifier matches Tamil,
 * Telugu, Hindi and English keywords exactly as before, `locale` still
 * travels in the payload, and the answer is still chosen as an
 * `answerKey` plus params — never prose. The frontend's renderAnswer
 * turns that into one sentence in the farmer's own language, and that
 * same string is what speech synthesis reads, so the spoken and written
 * answers cannot diverge.
 *
 * There is deliberately no route to Crop Diagnosis: chat can never
 * trigger an inference.
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

const text = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : null;
const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

async function weatherFor(ctx: Record<string, unknown>): Promise<DataResult<unknown>> {
  const coords = parseCoordinates(ctx.latitude, ctx.longitude);
  if (!coords) return { status: "unavailable", reason: "This farm has no location set." };
  const res = await fetch(
    `${OPEN_METEO_URL}?${openMeteoQuery(coords.latitude, coords.longitude).toString()}`,
    { headers: { accept: "application/json" }, signal: AbortSignal.timeout(AGENT_TIMEOUT_MS) }
  );
  if (!res.ok) {
    console.error("Chat: Open-Meteo failure", res.status);
    return { status: "unavailable", reason: "The weather service is currently unavailable." };
  }
  return mapOpenMeteo(await res.json());
}

async function marketFor(ctx: Record<string, unknown>, crop: string | null): Promise<DataResult<unknown>> {
  const resolved = resolveLocation(ctx.state, ctx.district, crop);
  if (!resolved.resolved) {
    return { status: "unavailable", reason: resolved.reason ?? "No market district matched this farm." };
  }
  const apiKey = process.env.DATA_GOV_IN_API_KEY;
  if (!apiKey) {
    console.error("Chat: DATA_GOV_IN_API_KEY is not set; market answer unavailable.");
    return { status: "unavailable", reason: "The market price service is not configured." };
  }
  const query = agmarknetQuery(resolved);
  query.set("api-key", apiKey);
  const res = await fetch(`${AGMARKNET_URL}?${query.toString()}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(AGENT_TIMEOUT_MS)
  });
  if (!res.ok) {
    // The provider's body echoes the query string, which carries the key.
    console.error("Chat: AGMARKNET failure", res.status);
    return { status: "unavailable", reason: "The market price service is currently unavailable." };
  }
  return mapAgmarknet(await res.json(), resolved);
}

function schemesFor(ctx: Record<string, unknown>): DataResult<unknown> {
  return matchSchemes(
    { state: ctx.state, district: ctx.district, areaAcres: ctx.areaAcres, crops: ctx.crops, locale: ctx.locale },
    () => new Date(), CATALOG, CATALOG_VERSION
  );
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") return unavailable("Method not allowed.", 405);

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return unavailable("The assistant is not configured.");

  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return unavailable("Not signed in.", 401);
  if (!(await isSignedIn(token, supabaseUrl, anonKey))) return unavailable("Not signed in.", 401);

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return unavailable("The question could not be read.", 400);
  }
  const body = typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : {};

  const question = text(body.text);
  if (!question) return unavailable("No question was asked.", 400);

  const crops = Array.isArray(body.crops)
    ? (body.crops as unknown[]).map((c) => text(c)).filter((c): c is string => c !== null)
    : [];
  const context: Record<string, unknown> = {
    farmId: text(body.farmId),
    state: text(body.state),
    district: text(body.district),
    latitude: num(body.latitude),
    longitude: num(body.longitude),
    areaAcres: num(body.areaAcres),
    crops,
    primaryCrop: text(body.primaryCrop) ?? crops[0] ?? null,
    // Already projected by the browser; re-read here so nothing beyond
    // the permitted fields can reach an answer.
    latestSoil: body.latestSoil ?? null,
    recentScans: Array.isArray(body.recentScans) ? body.recentScans : [],
    locale: text(body.locale) ?? "en"
  };

  const classified = classifyIntent(question, crops, context.primaryCrop as string | null);

  // Only the route's own agent is consulted. allSettled so an
  // unavailable agent yields a "source unavailable" answer rather than
  // failing the whole request.
  const branches: ChatBranches = {};
  const wanted: Promise<void>[] = [];
  const attach = <K extends keyof ChatBranches>(k: K, p: Promise<DataResult<unknown>>) => {
    wanted.push(p.then((v) => { branches[k] = v; }, () => { branches[k] = { status: "unavailable", reason: "agent threw" }; }));
  };

  if (classified.route === "weather") attach("weather", weatherFor(context));
  else if (classified.route === "market") attach("market", marketFor(context, classified.cropSlot));
  else if (classified.route === "schemes") attach("schemes", Promise.resolve(schemesFor(context)));
  else if (classified.route === "briefing") {
    attach("briefing", orchestrate(context, {
      weather: (c) => weatherFor(c as unknown as Record<string, unknown>),
      market: (c) => marketFor(c as unknown as Record<string, unknown>, c.primaryCrop),
      schemes: async (c) => schemesFor(c as unknown as Record<string, unknown>)
    }, { applyRules, buildBriefing, briefingUnavailable, isUsable }) as Promise<DataResult<unknown>>);
  }
  await Promise.allSettled(wanted);

  return new Response(
    JSON.stringify(buildAnswer({ ...classified, context }, branches)),
    { headers: { "content-type": "application/json", "cache-control": "no-store" } }
  );
}
