import assert from "node:assert/strict";
import test from "node:test";
import type { DataResult } from "@agri-one/shared-types";
import { normalizeChatResult } from "./normalize.ts";

/**
 * Chat - Core lives in n8n and can change without this codebase
 * noticing. The load-bearing assertion here is that there is no
 * free-text path: whatever the agent sends, only `answerKey` and
 * `params` survive, so a payload carrying prose could never be rendered
 * to a farmer.
 */

function ok(data: unknown): DataResult<unknown> {
  return { status: "ok", asOf: "2026-09-22T10:00:00.000Z", source: "agri-one-chat", data };
}

const answer = {
  intent: "weather.today",
  answerKey: "weatherToday",
  params: { temp: 28.7, humidity: 60 },
  sources: ["weather"],
  signals: { weather: { status: "ok", reasonKey: null, asOf: "2026-09-22T10:00:00.000Z" } }
};

test("passes a well-formed answer through unchanged", () => {
  const r = normalizeChatResult(ok(answer));
  assert.equal(r.status, "ok");
  if (r.status !== "ok") return;
  assert.equal(r.data.answerKey, "weatherToday");
  assert.equal(r.data.intent, "weather.today");
  assert.deepEqual(r.data.sources, ["weather"]);
  assert.equal(r.data.params?.temp, 28.7);
});

test("there is no free-text path — prose fields are discarded", () => {
  const r = normalizeChatResult(
    ok({ ...answer, text: "You should spray 2ml/l of mancozeb", message: "apply urea now" })
  );
  assert.equal(r.status, "ok");
  if (r.status !== "ok") return;
  const serialized = JSON.stringify(r.data);
  assert.ok(!serialized.includes("spray"));
  assert.ok(!serialized.includes("mancozeb"));
  assert.ok(!serialized.includes("urea"));
  assert.deepEqual(Object.keys(r.data).sort(), [
    "answerKey",
    "intent",
    "params",
    "signals",
    "sources"
  ]);
});

test("an answer with no key is unusable — there is no prose fallback", () => {
  for (const broken of [{ ...answer, answerKey: "" }, { ...answer, answerKey: undefined }]) {
    assert.equal(normalizeChatResult(ok(broken)).status, "unavailable");
  }
});

test("an unrecognised intent falls back to unknown", () => {
  const r = normalizeChatResult(ok({ ...answer, intent: "agronomy.advice" }));
  assert.equal(r.status, "ok");
  if (r.status !== "ok") return;
  assert.equal(r.data.intent, "unknown");
});

test("an unrecognised source is dropped", () => {
  const r = normalizeChatResult(ok({ ...answer, sources: ["weather", "llm", "", null] }));
  assert.equal(r.status, "ok");
  if (r.status !== "ok") return;
  assert.deepEqual(r.data.sources, ["weather"]);
});

test("an unrecognised signal status degrades to unavailable, never ok", () => {
  const r = normalizeChatResult(
    ok({ ...answer, signals: { weather: { status: "probably_fine", reasonKey: null } } })
  );
  assert.equal(r.status, "ok");
  if (r.status !== "ok") return;
  assert.equal(r.data.signals.weather?.status, "unavailable");
  assert.equal(r.data.signals.weather?.reasonKey, "agentUnavailable");
});

test("params keep only renderable scalars", () => {
  const r = normalizeChatResult(
    ok({ ...answer, params: { temp: 28.7, junk: { a: 1 }, empty: "  ", crop: "Tomato" } })
  );
  assert.equal(r.status, "ok");
  if (r.status !== "ok") return;
  assert.deepEqual(r.data.params, { temp: 28.7, crop: "Tomato" });
});

test("an unavailable agent answer is preserved, not softened", () => {
  const r = normalizeChatResult(
    ok({
      intent: "market.price",
      answerKey: "sourceUnavailable",
      params: { source: "market" },
      sources: ["market"],
      signals: { market: { status: "unavailable", reasonKey: "agentUnavailable", asOf: null } }
    })
  );
  assert.equal(r.status, "ok");
  if (r.status !== "ok") return;
  assert.equal(r.data.answerKey, "sourceUnavailable");
  assert.equal(r.data.signals.market?.status, "unavailable");
});

test("keeps the agent's own unavailable reason", () => {
  const r = normalizeChatResult({ status: "unavailable", reason: "I couldn't read that question." });
  assert.equal(r.status, "unavailable");
  if (r.status !== "unavailable") return;
  assert.match(r.reason, /couldn't read/);
});

test("supplies a reason when the agent sent an empty one", () => {
  const r = normalizeChatResult({ status: "unavailable", reason: "" });
  assert.equal(r.status, "unavailable");
  if (r.status !== "unavailable") return;
  assert.ok(r.reason.length > 0);
});

test("a non-object payload is unavailable, not a crash", () => {
  for (const junk of [null, "text", 42, []]) {
    assert.equal(normalizeChatResult(ok(junk)).status, "unavailable");
  }
});

test("no undefined or NaN reaches the rendered shape", () => {
  const r = normalizeChatResult(ok(answer));
  assert.equal(r.status, "ok");
  if (r.status !== "ok") return;
  const s = JSON.stringify(r.data);
  assert.ok(!s.includes("undefined"));
  assert.ok(!s.includes("NaN"));
});
