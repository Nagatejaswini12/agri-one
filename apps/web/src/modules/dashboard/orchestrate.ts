import type { DataResult, FarmBriefing } from "@agri-one/shared-types";
import type {
  BriefingContext,
  BriefingScanInput,
  Signal,
  SignalBundle
} from "./decisionRules.js";
import type { DecisionAction } from "@agri-one/shared-types";

/**
 * The Orchestrator, moved out of n8n.
 *
 * A direct port of Build Agent Inputs → readiness gates → Collect
 * Signals, wrapped around the decision rules. The n8n workflow is left
 * in place and untouched as a rollback copy.
 *
 * Nothing here reads Supabase. Everything about the farm arrives in the
 * request, already scoped to the signed-in farmer by row-level security
 * on the frontend's own queries — so this holds no database credential.
 *
 * Readiness is computed rather than discovered by failure: calling the
 * weather agent with no coordinates would burn a round trip to learn
 * something the farm record already told us, and would report "the
 * weather service failed" when the truth is "this farm has no location
 * saved" — a difference the farmer can act on.
 *
 * Pure apart from the agent callbacks, which are injected. That is what
 * makes every fan-out combination testable without a network.
 */

const text = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : null;

const num = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
};

/**
 * Anything unparseable degrades to empty rather than throwing — a
 * missing scan list is a thinner briefing, not an error.
 */
function parseArray(v: unknown): unknown[] {
  let raw: unknown = v;
  if (typeof raw === "string") {
    const s = raw.trim();
    if (s === "") return [];
    try {
      raw = JSON.parse(s);
    } catch {
      return [];
    }
  }
  return Array.isArray(raw) ? raw : [];
}

function parseObject(v: unknown): Record<string, unknown> | null {
  let raw: unknown = v;
  if (typeof raw === "string") {
    const s = raw.trim();
    if (s === "" || s === "null") return null;
    try {
      raw = JSON.parse(s);
    } catch {
      return null;
    }
  }
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
}

export interface Readiness {
  weatherReady: boolean;
  marketReady: boolean;
  weatherSkipReason: string | null;
  marketSkipReason: string | null;
}

/**
 * Normalises the farm context the frontend supplied and decides which
 * agents are worth calling at all.
 *
 * The projection boundary is enforced here as well as in the browser:
 * only the fields the rules are permitted to use are copied across. The
 * disease label and the disclaimer are never sent by the frontend and
 * are not accepted here either, so no rule can turn a diagnosis into a
 * treatment. Soil is presence and age only — NPK and pH are not part of
 * this contract, so soil chemistry cannot become advice.
 */
export function buildAgentInputs(input: Record<string, unknown>): {
  context: BriefingContext;
  readiness: Readiness;
} {
  const state = text(input.state);
  const district = text(input.district);
  const latitude = num(input.latitude);
  const longitude = num(input.longitude);
  const crops = parseArray(input.crops)
    .map((c) => text(c))
    .filter((c): c is string => c !== null);
  const primaryCrop = text(input.primaryCrop) || (crops.length > 0 ? crops[0] : null);

  const recentScans: BriefingScanInput[] = [];
  for (const s of parseArray(input.recentScans)) {
    if (!s || typeof s !== "object") continue;
    const row = s as Record<string, unknown>;
    const createdAt = text(row.createdAt);
    if (!createdAt) continue;
    recentScans.push({
      scanId: text(row.scanId),
      cropName: text(row.cropName),
      createdAt,
      category: text(row.category),
      confidenceLevel: text(row.confidenceLevel),
      recommendExpertConsult: row.recommendExpertConsult === true
    });
  }
  recentScans.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));

  const rawSoil = parseObject(input.latestSoil);
  const testedOn = rawSoil ? text(rawSoil.testedOn) : null;
  const latestSoil = testedOn ? { testedOn } : null;

  const context: BriefingContext = {
    farmId: text(input.farmId),
    state,
    district,
    latitude,
    longitude,
    areaAcres: num(input.areaAcres),
    crops,
    primaryCrop,
    latestSoil,
    recentScans,
    locale: text(input.locale) || "en"
  };

  const weatherReady = latitude !== null && longitude !== null;
  const marketReady = state !== null && district !== null && primaryCrop !== null;

  return {
    context,
    readiness: {
      weatherReady,
      marketReady,
      weatherSkipReason: weatherReady ? null : "noCoordinates",
      marketSkipReason: !state || !district ? "noDistrict" : !primaryCrop ? "noCrop" : null
    }
  };
}

/**
 * Turns one agent's outcome into a signal, never throwing.
 *
 * A branch that was gated off becomes "skipped" carrying the reason the
 * gate computed. A branch that ran but failed becomes "unavailable".
 * One dead agent must never cost the farmer the whole briefing.
 */
export function toSignal(payload: DataResult<unknown> | null, skipReason: string | null): Signal {
  if (payload === null) {
    return skipReason
      ? { status: "skipped", reasonKey: skipReason }
      : { status: "unavailable", reasonKey: "notConsulted" };
  }
  if (payload.status === "ok" && payload.data && typeof payload.data === "object") {
    return { status: "ok", asOf: payload.asOf || null, data: payload.data as Record<string, unknown> };
  }
  // The agent's own reason is a farmer-facing sentence; the briefing
  // renders a translated key instead, so only the fact is kept.
  return { status: "unavailable", reasonKey: "agentUnavailable" };
}

/**
 * The rule engine, injected rather than imported.
 *
 * A value import of ./decisionRules would have to carry a file
 * extension, and the two toolchains disagree about which: Node's test
 * runner resolves ".ts" and rejects ".js", while the Vercel typecheck
 * does the opposite. A type-only import erases, so both are satisfied
 * and the caller — the endpoint or a test — supplies the functions.
 */
export interface RuleEngine {
  applyRules: (c: BriefingContext, s: SignalBundle, now: Date) => DecisionAction[];
  buildBriefing: (c: BriefingContext, s: SignalBundle, a: DecisionAction[], now: Date) => DataResult<FarmBriefing>;
  briefingUnavailable: () => DataResult<FarmBriefing>;
  isUsable: (c: BriefingContext | null) => boolean;
}

/** Injected so every fan-out combination is testable without a network. */
export interface AgentCallers {
  weather: (ctx: BriefingContext) => Promise<DataResult<unknown>>;
  market: (ctx: BriefingContext) => Promise<DataResult<unknown>>;
  schemes: (ctx: BriefingContext) => Promise<DataResult<unknown>>;
}

/**
 * Runs the agents and assembles the briefing.
 *
 * The three calls are isolated with `Promise.allSettled`, never
 * `Promise.all`. This mirrors `onError: continueRegularOutput` on every
 * n8n Call node, and it is the single most important detail here: with
 * `Promise.all`, one rejected agent would reject the whole batch and a
 * farmer would get a blank dashboard because the market service was
 * down.
 */
export async function orchestrate(
  input: Record<string, unknown>,
  agents: AgentCallers,
  rules: RuleEngine,
  now: () => Date = () => new Date()
): Promise<DataResult<FarmBriefing>> {
  const { context, readiness } = buildAgentInputs(input);
  if (!rules.isUsable(context)) return rules.briefingUnavailable();

  const settled = await Promise.allSettled([
    readiness.weatherReady ? agents.weather(context) : Promise.resolve(null),
    readiness.marketReady ? agents.market(context) : Promise.resolve(null),
    agents.schemes(context)
  ]);

  /** A thrown agent is indistinguishable from a failed one to the farmer. */
  const outcome = (i: number): DataResult<unknown> | null => {
    const r = settled[i];
    if (r.status === "rejected") return { status: "unavailable", reason: "agent threw" };
    return r.value;
  };

  const signals: SignalBundle = {
    weather: toSignal(outcome(0), readiness.weatherSkipReason),
    market: toSignal(outcome(1), readiness.marketSkipReason),
    schemes: toSignal(outcome(2), null)
  };

  const at = now();
  return rules.buildBriefing(context, signals, rules.applyRules(context, signals, at), at);
}
