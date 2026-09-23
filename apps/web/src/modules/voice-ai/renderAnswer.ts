import type { ChatAnswer } from "@agri-one/shared-types";

type Translate = (key: string, options?: Record<string, unknown>) => string;

/**
 * Turns an answer's key and params into one sentence in the farmer's
 * language.
 *
 * This is the ONLY place a chat sentence is produced, and it is a pure
 * function on purpose: the same string is shown on screen and handed to
 * speech synthesis, so the spoken and written answers cannot diverge.
 *
 * Nothing is invented here. A param the agent did not send is simply not
 * rendered — the soil answer lists only the values the farmer actually
 * recorded, and never fills a gap with a zero or a dash.
 */

/** Nested lookups that reuse labels other modules already own. */
function condition(t: Translate, code: unknown): string | null {
  if (typeof code !== "number" || !Number.isFinite(code)) return null;
  return t(`weather.wmo.${code}`, { defaultValue: t("weather.wmo.unknown") });
}

function soilTypeLabel(t: Translate, value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const key = value.trim().toLowerCase();
  return t(`soil.types.${key}`, { defaultValue: value.trim() });
}

/**
 * Builds "pH 6.5, Nitrogen (N) 280, ..." from whichever readings exist,
 * reusing the Soil & Water labels so the wording matches that page.
 *
 * Deliberately a plain list of recorded numbers: no reading is compared
 * to a threshold, ranked, or turned into a recommendation.
 */
function soilValues(t: Translate, params: Record<string, string | number>): string {
  const parts: string[] = [];
  const push = (labelKey: string, value: unknown) => {
    if (typeof value === "number" && Number.isFinite(value)) {
      parts.push(`${t(labelKey)} ${value}`);
    }
  };
  const type = soilTypeLabel(t, params.soilType);
  if (type) parts.push(`${t("soil.soilType")} ${type}`);
  push("soil.ph", params.ph);
  push("soil.nitrogen", params.nitrogen);
  push("soil.phosphorus", params.phosphorus);
  push("soil.potassium", params.potassium);
  push("soil.organicCarbon", params.organicCarbon);
  return parts.join(", ");
}

function formatDate(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const iso = value.trim();
  const parsed = Date.parse(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

export function renderAnswer(t: Translate, answer: ChatAnswer): string {
  const params = answer.params ?? {};
  const extra: Record<string, unknown> = { ...params };

  // Resolve nested keys before interpolation so the template only ever
  // sees finished text.
  const cond = condition(t, params.code);
  if (cond) extra.condition = cond;

  const source = typeof params.source === "string" ? params.source : null;
  if (source) extra.sourceLabel = t(`decision.signal.${source}`, { defaultValue: source });

  for (const key of ["date", "reportedOn", "testedOn"]) {
    const formatted = formatDate(params[key]);
    if (formatted) extra[key] = formatted;
  }

  if (answer.answerKey === "soilStatus") {
    extra.values = soilValues(t, params);
  }

  return t(`chat.answer.${answer.answerKey}`, {
    ...extra,
    defaultValue: t("chat.answer.unknown")
  });
}
