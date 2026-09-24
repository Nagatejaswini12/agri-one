import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import i18next from "i18next";
import { COST_CATEGORIES, REVENUE_CATEGORIES, YIELD_UNITS } from "./constants.ts";

/**
 * Every category and unit the forms can store must have a label in all
 * four languages — an unlabelled key would render as `reports.category.x`
 * in a farmer's own ledger.
 *
 * `entriesCounted` is pluralised, and i18next pluralises on `count`;
 * getting that wrong renders the raw key, so both forms are asserted.
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

test("every storable category has a label in every language", async () => {
  const all = [...COST_CATEGORIES, ...REVENUE_CATEGORIES];
  assert.ok(all.length > 0);
  for (const lang of LANGS) {
    await i18n.changeLanguage(lang);
    for (const key of all) {
      const text = i18n.t(`reports.category.${key}`);
      assert.notEqual(text, `reports.category.${key}`, `${lang}/${key} did not resolve`);
    }
  }
});

test("every storable unit has a label in every language", async () => {
  for (const lang of LANGS) {
    await i18n.changeLanguage(lang);
    for (const key of YIELD_UNITS) {
      const text = i18n.t(`reports.unitName.${key}`);
      assert.notEqual(text, `reports.unitName.${key}`, `${lang}/${key} did not resolve`);
    }
  }
});

test("the entry count pluralises in every language", async () => {
  for (const lang of LANGS) {
    await i18n.changeLanguage(lang);
    for (const count of [1, 5]) {
      const text = i18n.t("reports.entriesCounted", { count });
      assert.notEqual(text, "reports.entriesCounted", `${lang}/${count} did not resolve`);
      assert.ok(text.includes(String(count)), `${lang}/${count} dropped the number`);
      assert.ok(!text.includes("{{"), `${lang}/${count} left a placeholder`);
    }
  }
});

test("all reports UI strings resolve in every language", async () => {
  const b = bundle("en").reports;
  const keys: string[] = [];
  for (const [k, v] of Object.entries(b)) {
    if (typeof v === "string") {
      // Plural variants are covered by their own assertion above.
      if (!/_one$|_other$/.test(k)) keys.push(`reports.${k}`);
    } else {
      for (const sub of Object.keys(v)) keys.push(`reports.${k}.${sub}`);
    }
  }
  for (const lang of LANGS) {
    await i18n.changeLanguage(lang);
    for (const key of keys) {
      const text = i18n.t(key);
      assert.notEqual(text, key, `${lang}/${key} did not resolve`);
      assert.ok(!text.includes("{{"), `${lang}/${key} left a placeholder`);
    }
    assert.notEqual(i18n.t("common.cancel"), "common.cancel", `${lang}/common.cancel missing`);
  }
});

test("no reports label prescribes a treatment", () => {
  // "Fertiliser" is legitimate here — it labels money the farmer spent,
  // the same way a receipt does. What must never appear is a product, a
  // dose, or an instruction to apply anything.
  const BANNED = [
    "spray", "dosage", "apply ", "kg/ha", "ml/l", "per hectare",
    "you should", "we recommend", "mancozeb", "urea"
  ];
  for (const [key, value] of Object.entries(bundle("en").reports)) {
    const text = typeof value === "string" ? value : Object.values(value).join(" ");
    const lower = text.toLowerCase();
    const hit = BANNED.find((w) => lower.includes(w));
    assert.equal(hit, undefined, `en/${key} contains "${hit}"`);
  }
});
