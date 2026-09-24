import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import i18next from "i18next";
import { renderAnswer } from "./renderAnswer.ts";

/**
 * Every answer the agent can emit must render in all four languages,
 * with every placeholder filled. A missing key would read a raw
 * `chat.answer.…` string aloud to a farmer, which is worse than silence.
 *
 * The safety audit at the bottom is the reason this file matters most:
 * it is what keeps the chat templates on the right side of the line
 * between reporting a record and prescribing a treatment.
 */

const LANGS = ["en", "ta", "te", "hi"] as const;

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

/** Covers every placeholder any chat template uses. */
const PARAMS = {
  temp: 28.7, humidity: 60, wind: 12, code: 3,
  maxTemp: 33.3, minTemp: 25.6, rainChance: 15, days: 3,
  date: "2026-09-22", reportedOn: "2026-09-22", testedOn: "2026-03-01",
  crop: "Tomato", variety: "Bellary", price: 3000, market: "Tiruthani", district: "Thiruvellore",
  count: 6, total: 4, high: 1, confidence: "low",
  state: "Tamil Nadu", areaAcres: 2, cropCount: 2, crops: "Tomato, onion",
  values: "pH 6.5, Nitrogen (N) 280", sourceLabel: "Market", language: "English",
  // `condition` is normally resolved from a WMO code by renderAnswer;
  // these tests hit the templates directly, so it is supplied here.
  condition: "Overcast"
};

test("every chat answer key resolves in every language", async () => {
  const keys = Object.keys(bundle("en").chat.answer);
  assert.ok(keys.length > 0);
  for (const lang of LANGS) {
    await i18n.changeLanguage(lang);
    for (const key of keys) {
      const text = i18n.t(`chat.answer.${key}`, PARAMS);
      assert.notEqual(text, `chat.answer.${key}`, `${lang}/${key} did not resolve`);
      assert.ok(!text.includes("{{"), `${lang}/${key} left a placeholder: ${text}`);
    }
  }
});

test("chat UI strings resolve in every language", async () => {
  const b = bundle("en").chat;
  const flat: string[] = [];
  for (const [k, v] of Object.entries(b)) {
    if (k === "answer") continue;
    if (typeof v === "string") flat.push(`chat.${k}`);
    else for (const sub of Object.keys(v)) flat.push(`chat.${k}.${sub}`);
  }
  for (const lang of LANGS) {
    await i18n.changeLanguage(lang);
    for (const key of flat) {
      const text = i18n.t(key, PARAMS);
      assert.notEqual(text, key, `${lang}/${key} did not resolve`);
      assert.ok(!text.includes("{{"), `${lang}/${key} left a placeholder`);
    }
  }
});

test("renderAnswer produces one filled sentence, in every language", async () => {
  for (const lang of LANGS) {
    await i18n.changeLanguage(lang);
    const text = renderAnswer((k, o) => String(i18n.t(k, o as never)), {
      intent: "weather.today",
      answerKey: "weatherToday",
      params: { temp: 28.7, humidity: 60, wind: 12, code: 3 },
      sources: ["weather"],
      signals: {}
    });
    assert.ok(text.length > 0);
    assert.ok(!text.includes("{{"), `${lang} left a placeholder`);
    assert.ok(!text.includes("undefined"), `${lang} rendered undefined`);
    assert.ok(text.includes("28.7"), `${lang} dropped the temperature`);
  }
});

test("an unknown answer key falls back to the capability explanation", async () => {
  await i18n.changeLanguage("en");
  const text = renderAnswer((k, o) => String(i18n.t(k, o as never)), {
    intent: "unknown",
    answerKey: "somethingTheAgentInvented",
    params: null,
    sources: [],
    signals: {}
  });
  assert.ok(!text.includes("chat.answer."), "rendered a raw key");
  assert.ok(/only answer using your own/i.test(text));
});

test("the soil answer lists only values that were actually recorded", async () => {
  await i18n.changeLanguage("en");
  const text = renderAnswer((k, o) => String(i18n.t(k, o as never)), {
    intent: "soil.status",
    answerKey: "soilStatus",
    // phosphorus, potassium and organic carbon were never recorded.
    params: { testedOn: "2026-03-01", soilType: "loamy", ph: 6.5, nitrogen: 280 },
    sources: ["soil"],
    signals: {}
  });
  assert.ok(text.includes("6.5"));
  assert.ok(text.includes("280"));
  assert.ok(!/Phosphorus/i.test(text), "invented a phosphorus reading");
  assert.ok(!/Potassium/i.test(text), "invented a potassium reading");
  assert.ok(!text.includes("undefined"));
  assert.ok(!text.includes("NaN"));
});

test("no chat template prescribes a treatment", async () => {
  // Soil parameter NAMES (nitrogen, phosphorus, potassium, pH) are
  // legitimate here: soil.status reports what the farmer recorded, and
  // the Soil & Water page already labels them the same way. What must
  // never appear is a product, a dose, or an instruction to apply
  // something — that is the line between reporting a record and giving
  // agronomic advice.
  const BANNED_EN = [
    "spray", "dosage", "pesticide", "fungicide", "insecticide", "herbicide",
    "kg/ha", "ml/l", "g/l", "per hectare", "you should apply", "we recommend",
    "increase your", "add fertiliser", "add fertilizer"
  ];
  const BANNED_PRODUCTS = [
    "urea", "dap", "mancozeb", "carbendazim", "imidacloprid",
    "glyphosate", "chlorpyrifos", "potash"
  ];

  for (const [key, value] of Object.entries(bundle("en").chat.answer)) {
    const lower = String(value).toLowerCase();
    const hit = BANNED_EN.find((w) => lower.includes(w));
    assert.equal(hit, undefined, `en/${key} contains "${hit}"`);
  }
  for (const lang of LANGS) {
    for (const [key, value] of Object.entries(bundle(lang).chat.answer)) {
      const lower = String(value).toLowerCase();
      const hit = BANNED_PRODUCTS.find((w) => lower.includes(w));
      assert.equal(hit, undefined, `${lang}/${key} names product "${hit}"`);
    }
  }
});

test("no chat template claims scheme eligibility", () => {
  for (const lang of LANGS) {
    for (const [key, value] of Object.entries(bundle(lang).chat.answer)) {
      assert.ok(
        !/you are eligible|you qualify/i.test(String(value)),
        `${lang}/${key} claims eligibility`
      );
    }
  }
  // The scheme answer must actively say conditions remain to be checked.
  assert.match(bundle("en").chat.answer.schemesList as unknown as string, /conditions/i);
});
