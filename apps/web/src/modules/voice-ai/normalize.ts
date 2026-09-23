import type {
  ChatAnswer,
  ChatIntent,
  DataResult,
  DecisionSourceAgent,
  SignalStatus
} from "@agri-one/shared-types";

/**
 * Chat - Core runs in n8n, outside this codebase's type checking, so a
 * workflow edit could change its payload without the frontend knowing.
 *
 * The invariant enforced here, independently of the agent, is that
 * there is no free-text path: only `answerKey` + `params` survive, and
 * the rendered sentence is composed from the locale bundles. If a
 * future payload carried prose, it would be dropped rather than shown.
 */

const INTENTS: readonly ChatIntent[] = [
  "weather.today",
  "weather.forecast",
  "market.price",
  "schemes.list",
  "diagnosis.recent",
  "farm.info",
  "soil.status",
  "briefing.summary",
  "unknown"
];

const AGENTS: readonly DecisionSourceAgent[] = [
  "weather",
  "market",
  "schemes",
  "diagnosis",
  "soil",
  "farm"
];

const STATUSES = ["ok", "unavailable", "skipped"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/** Only renderable scalars survive — see `DecisionAction` for the same rule. */
function asParams(value: unknown): Record<string, string | number> | null {
  if (!isRecord(value)) return null;
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else {
      const s = asString(v);
      if (s) out[k] = s;
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

function asSources(value: unknown): DecisionSourceAgent[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is DecisionSourceAgent =>
    AGENTS.includes(v as DecisionSourceAgent)
  );
}

function asSignals(value: unknown): Partial<Record<DecisionSourceAgent, SignalStatus>> {
  if (!isRecord(value)) return {};
  const out: Partial<Record<DecisionSourceAgent, SignalStatus>> = {};
  for (const agent of AGENTS) {
    const raw = value[agent];
    if (!isRecord(raw)) continue;
    const status = STATUSES.includes(raw.status as (typeof STATUSES)[number])
      ? (raw.status as SignalStatus["status"])
      : "unavailable";
    out[agent] = {
      status,
      reasonKey: status === "ok" ? null : asString(raw.reasonKey) ?? "agentUnavailable",
      asOf: asString(raw.asOf)
    };
  }
  return out;
}

export function normalizeChatResult(result: DataResult<unknown>): DataResult<ChatAnswer> {
  if (result.status === "unavailable") {
    if (asString(result.reason)) return result;
    return { status: "unavailable", reason: "The assistant is currently unavailable." };
  }

  const data = result.data;
  if (!isRecord(data)) {
    return { status: "unavailable", reason: "The assistant returned an unreadable response." };
  }

  const answerKey = asString(data.answerKey);
  // Without a key there is nothing to render, and there is deliberately
  // no prose fallback to render instead.
  if (!answerKey) {
    return { status: "unavailable", reason: "The assistant returned an unreadable response." };
  }

  const intent = INTENTS.includes(data.intent as ChatIntent)
    ? (data.intent as ChatIntent)
    : "unknown";

  return {
    status: "ok",
    asOf: asString(result.asOf) ?? new Date().toISOString(),
    source: asString(result.source) ?? "unknown",
    data: {
      intent,
      answerKey,
      params: asParams(data.params),
      sources: asSources(data.sources),
      signals: asSignals(data.signals)
    }
  };
}
