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

test("the dashboard no longer promises market and scheme guidance later", async () => {
  // The briefing now carries both, so the old notice would read as false.
  for (const lang of LANGS) {
    await i18n.changeLanguage(lang);
    const text = i18n.t("dashboard.agentsComingSoon");
    assert.notEqual(text, "dashboard.agentsComingSoon");
    if (lang === "en") {
      assert.ok(!/market/i.test(text), "still mentions market as pending");
      assert.ok(!/scheme/i.test(text), "still mentions schemes as pending");
    }
  }
});
