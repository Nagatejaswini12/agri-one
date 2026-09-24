import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import i18next from "i18next";

/**
 * Marketplace shows the honesty copy — "these are mandis, not buyers" —
 * in whichever language the farmer reads. A missing key there would
 * quietly drop the one sentence that stops the page reading as a buyer
 * directory, so every string is asserted in all four languages.
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

const PARAMS = {
  crop: "Tomato",
  district: "Coimbatore",
  date: "24 Sep 2026",
  variety: "Local",
  source: "agmarknet-data.gov.in",
  time: "4:12 PM"
};

test("every marketplace string resolves in every language", async () => {
  const b = bundle("en").marketplace;
  const keys: string[] = [];
  for (const [k, v] of Object.entries(b)) {
    if (typeof v === "string") keys.push(`marketplace.${k}`);
    else for (const sub of Object.keys(v)) keys.push(`marketplace.${k}.${sub}`);
  }
  assert.ok(keys.length > 0);

  for (const lang of LANGS) {
    await i18n.changeLanguage(lang);
    for (const key of keys) {
      const text = i18n.t(key, PARAMS);
      assert.notEqual(text, key, `${lang}/${key} did not resolve`);
      assert.ok(!text.includes("{{"), `${lang}/${key} left a placeholder: ${text}`);
    }
  }
});

test("all three venue kinds have a label in every language", async () => {
  for (const lang of LANGS) {
    await i18n.changeLanguage(lang);
    for (const kind of ["farmersMarket", "regulatedYard", "other"]) {
      const text = i18n.t(`marketplace.kind.${kind}`);
      assert.notEqual(text, `marketplace.kind.${kind}`, `${lang}/${kind} did not resolve`);
    }
  }
});

test("the not-a-buyer-directory line exists in every language", async () => {
  for (const lang of LANGS) {
    await i18n.changeLanguage(lang);
    for (const key of ["marketplace.disclaimer", "marketplace.notADirectory"]) {
      const text = i18n.t(key);
      assert.notEqual(text, key, `${lang}/${key} missing`);
      assert.ok(text.length > 30, `${lang}/${key} is suspiciously short`);
    }
  }
});

test("no marketplace string implies a buyer, contact or guaranteed sale", () => {
  // The English copy is where meaning is authored.
  const BANNED = [
    "contact the buyer",
    "call the trader",
    "phone",
    "we will sell",
    "guaranteed price",
    "guaranteed buyer",
    "arrange the sale"
  ];
  const b = bundle("en").marketplace;
  for (const [key, value] of Object.entries(b)) {
    const text = typeof value === "string" ? value : Object.values(value).join(" ");
    const lower = text.toLowerCase();
    const hit = BANNED.find((w) => lower.includes(w));
    assert.equal(hit, undefined, `en/${key} contains "${hit}"`);
  }
});

test("the market labels Marketplace reuses still exist", async () => {
  // The page borrows these rather than duplicating them.
  for (const lang of LANGS) {
    await i18n.changeLanguage(lang);
    for (const key of [
      "market.min",
      "market.max",
      "market.grade",
      "market.selectCrop",
      "market.setLocation",
      "market.addCrop",
      "market.sourceNote",
      "market.fetchedAt"
    ]) {
      assert.notEqual(i18n.t(key, PARAMS), key, `${lang}/${key} missing`);
    }
  }
});
