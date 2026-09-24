import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import i18next from "i18next";

/**
 * Most briefing lines are unreachable in a browser test with one test
 * farm — the weather flags depend on the forecast, and several rules
 * only fire on farms with missing records. These assert the labels
 * directly instead, in all four languages, including the plural forms
 * (i18next pluralizes on `count`, and getting that wrong renders the raw
 * key to a farmer).
 */

const LANGS = ["en", "ta", "te", "hi"] as const;

/** The locale bundle is arbitrarily nested; callers index what they need. */
type Bundle = Record<string, Record<string, Record<string, string>>>;

function bundle(lang: string): Bundle {
  return JSON.parse(fs.readFileSync(`public/locales/${lang}/common.json`, "utf8")) as Bundle;
}

const i18n = i18next.createInstance();
await i18n.init({
  lng: "en",
  fallbackLng: "en",
  defaultNS: "common",
  interpolation: { escapeValue: false },
  resources: Object.fromEntries(LANGS.map((l) => [l, { common: bundle(l) }]))
});

/** Params covering every placeholder any action label uses. */
const PARAMS = {
  crop: "Tomato", variety: "Bellary",
  price: 3000,
  market: "Tiruthani",
  district: "Thiruvellore",
  reportedOn: "2026-09-21",
  low: 2500,
  high: 3000,
  lowMarket: "Paruthipattu",
  highMarket: "Tiruthani",
  testedOn: "2026-03-01",
  time: "5:30 PM"
};

test("every action label resolves with its placeholders filled", async () => {
  const actions = bundle("en").decision.action as Record<string, string>;
  const keys = new Set(Object.keys(actions).map((k) => k.replace(/_(one|other)$/, "")));
  assert.ok(keys.size > 0);

  for (const lang of LANGS) {
    await i18n.changeLanguage(lang);
    for (const key of keys) {
      const isPlural = typeof actions[`${key}_one`] === "string";
      const counts = isPlural ? [1, 4] : [undefined];
      for (const count of counts) {
        const text = i18n.t(
          `decision.action.${key}`,
          count === undefined ? PARAMS : { ...PARAMS, count }
        );
        assert.notEqual(text, `decision.action.${key}`, `${lang}/${key} did not resolve`);
        assert.ok(!text.includes("{{"), `${lang}/${key} left a placeholder: ${text}`);
        if (count !== undefined) {
          assert.ok(
            text.includes(String(count)) || count === 1,
            `${lang}/${key}/${count} dropped the number`
          );
        }
      }
    }
  }
});

test("signal, status, reason and group labels resolve in every language", async () => {
  const b = bundle("en").decision;
  const groups = [
    ...Object.keys(b.signal).map((k) => `decision.signal.${k}`),
    ...Object.keys(b.status).map((k) => `decision.status.${k}`),
    ...Object.keys(b.signalReason).map((k) => `decision.signalReason.${k}`),
    ...Object.keys(b.group).map((k) => `decision.group.${k}`),
    "decision.title",
    "decision.disclaimer",
    "decision.nothingToFlag",
    "decision.signalsUsed",
    "decision.signalOk",
    "decision.marketCropLabel",
    "decision.marketCropNote",
    "decision.actionUnknown",
    "decision.loading",
    "decision.loadError"
  ];
  for (const lang of LANGS) {
    await i18n.changeLanguage(lang);
    for (const key of groups) {
      const text = i18n.t(key);
      assert.notEqual(text, key, `${lang}/${key} did not resolve`);
      assert.ok(!text.includes("{{"), `${lang}/${key} left a placeholder`);
    }
    assert.ok(!i18n.t("decision.generatedAt", { time: "5:30 PM" }).includes("{{"));
  }
});

test("the dashboard notice never calls a shipped module unconnected", async () => {
  // This notice was written when most of the app was scaffolding, and it
  // quietly went stale: it was still telling farmers that buyers,
  // reports and voice were not connected after all three had shipped.
  // The earlier version of this test only watched for "market" and
  // "scheme", so it let three false claims through. Every module that
  // exists is listed here, and the list is what the test checks.
  const SHIPPED = [
    "market", "scheme", "buyer", "marketplace", "report", "voice",
    "pest", "weather", "soil", "scan", "diagnos", "chat"
  ];
  const UNCONNECTED = /not connected|coming soon|not yet|planned for|later phase|will be added/i;

  for (const lang of LANGS) {
    await i18n.changeLanguage(lang);
    const text = i18n.t("dashboard.agentsComingSoon");
    assert.notEqual(text, "dashboard.agentsComingSoon", `${lang} did not resolve`);
    assert.ok(!text.includes("{{"), `${lang} left a placeholder`);

    if (lang !== "en") continue;
    // A module may be named, or the notice may say something is pending
    // — but not both, because everything in SHIPPED is live.
    const named = SHIPPED.filter((m) => new RegExp(m, "i").test(text));
    if (UNCONNECTED.test(text)) {
      assert.deepEqual(
        named,
        [],
        `the notice says something is pending while naming shipped module(s): ${named.join(", ")}`
      );
    }
  }
});
