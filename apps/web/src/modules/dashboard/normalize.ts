import type {
  DataResult,
  DecisionAction,
  DecisionPriority,
  DecisionSourceAgent,
  FarmBriefing,
  SignalStatus
} from "@agri-one/shared-types";

/**
 * The Orchestrator runs in n8n, outside this codebase's type checking,
 * so a workflow edit can change its payload without the frontend
 * knowing. This coerces whatever arrives into `FarmBriefing`.
 *
 * Two invariants are enforced here as well as in the agent, because
 * either side could regress alone:
 *
 *  - an action with no `sourceAgent`, no `key` or an unknown priority is
 *    dropped. An unattributed briefing line is exactly the kind of
 *    confident-sounding claim this module exists to avoid;
 *  - every agent always gets an entry in `signals`, defaulting to
 *    "unavailable". A briefing that silently omits the agents that
 *    failed would read as a complete picture of the farm when it is not.
 */

const AGENTS: readonly DecisionSourceAgent[] = [
  "weather",
  "market",
  "schemes",
  "diagnosis",
  "soil",
  "farm"
];
const PRIORITIES: readonly DecisionPriority[] = ["high", "medium", "low"];
const STATUSES = ["ok", "unavailable", "skipped"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/** Only scalars survive — a nested object would have no sane label. */
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

function asActions(value: unknown): DecisionAction[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const key = asString(item.key);
    const sourceAgent = item.sourceAgent as DecisionSourceAgent;
    const priority = item.priority as DecisionPriority;
    if (!key) return [];
    if (!AGENTS.includes(sourceAgent)) return [];
    if (!PRIORITIES.includes(priority)) return [];
    return [{ key, params: asParams(item.params), priority, sourceAgent }];
  });
}

function asSignal(value: unknown): SignalStatus {
  if (!isRecord(value)) {
    return { status: "unavailable", reasonKey: "notConsulted", asOf: null };
  }
  const status = STATUSES.includes(value.status as (typeof STATUSES)[number])
    ? (value.status as SignalStatus["status"])
    : "unavailable";
  return {
    status,
    // An "ok" signal has nothing to explain; anything else must say why,
    // so a missing reason falls back rather than rendering blank.
    reasonKey: status === "ok" ? null : asString(value.reasonKey) ?? "agentUnavailable",
    asOf: asString(value.asOf)
  };
}

function asSignals(value: unknown): Record<DecisionSourceAgent, SignalStatus> {
  const source = isRecord(value) ? value : {};
  const out = {} as Record<DecisionSourceAgent, SignalStatus>;
  for (const agent of AGENTS) out[agent] = asSignal(source[agent]);
  return out;
}

export function normalizeBriefingResult(
  result: DataResult<unknown>
): DataResult<FarmBriefing> {
  if (result.status === "unavailable") {
    if (asString(result.reason)) return result;
    return { status: "unavailable", reason: "Your farm briefing is currently unavailable." };
  }

  const data = result.data;
  if (!isRecord(data)) {
    return { status: "unavailable", reason: "The briefing service returned an unreadable response." };
  }

  const farmId = asString(data.farmId);
  // Without a farm id the card cannot say which farm it is describing,
  // and an unattributed briefing is worse than none.
  if (!farmId) {
    return { status: "unavailable", reason: "The briefing service returned an unreadable response." };
  }

  return {
    status: "ok",
    asOf: asString(result.asOf) ?? new Date().toISOString(),
    source: asString(result.source) ?? "unknown",
    data: {
      farmId,
      generatedAt: asString(data.generatedAt) ?? new Date().toISOString(),
      primaryCrop: asString(data.primaryCrop),
      signals: asSignals(data.signals),
      actions: asActions(data.actions),
      disclaimer: asString(data.disclaimer)
    }
  };
}
