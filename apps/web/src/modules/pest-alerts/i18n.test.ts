import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import i18next from "i18next";

/**
 * Pest Activity's copy is where this feature could most easily go wrong.
 * A mistranslation that turns "your scans found nothing" into "your farm
 * has no pests", or a line that drifts into telling a farmer what to
 * apply, would be the whole point of the module lost — in a language the
 * author may not read. Every string is asserted in all four.
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

const PARAMS = { days: 90, date: "24 Sep 2026", crop: "Tomato", percent: 81 };

/** Every leaf key under pestActivity, flattened. */
function pestKeys(): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(bundle("en").pestActivity)) {
    if (typeof v === "string") out.push(`pestActivity.${k}`);
    else for (const sub of Object.keys(v)) out.push(`pestActivity.${k}.${sub}`);
  }
  return out;
}

test("every pest activity string resolves in every language", async () => {
  const keys = pestKeys();
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

test("no pest string prescribes a treatment, in any language", async () => {
  // Nothing on this page may tell a farmer what to put on a plant. The
  // English copy is where meaning is authored, so the instruction words
  // are checked there; product names are checked everywhere, because a
  // chemical name survives translation unchanged.
  const BANNED_EN = [
    "spray", "dosage", "pesticide", "fungicide", "insecticide", "herbicide",
    "acaricide", "miticide", "kg/ha", "ml/l", "per hectare",
    "you should apply", "we recommend", "apply "
  ];
  const BANNED_PRODUCTS = [
    "urea", "dap", "mancozeb", "carbendazim", "imidacloprid", "abamectin",
    "glyphosate", "chlorpyrifos", "neem oil", "malathion"
  ];

  for (const [key, value] of Object.entries(bundle("en").pestActivity)) {
    const text = typeof value === "string" ? value : Object.values(value).join(" ");
    const lower = text.toLowerCase();
    const hit = BANNED_EN.find((w) => lower.includes(w));
    assert.equal(hit, undefined, `en/${key} contains "${hit}"`);
  }
  for (const lang of LANGS) {
    for (const [key, value] of Object.entries(bundle(lang).pestActivity)) {
      const text = typeof value === "string" ? value : Object.values(value).join(" ");
      const lower = text.toLowerCase();
      const hit = BANNED_PRODUCTS.find((w) => lower.includes(w));
      assert.equal(hit, undefined, `${lang}/${key} names product "${hit}"`);
    }
  }
});

test("no pest string predicts risk or derives anything from weather", () => {
  for (const [key, value] of Object.entries(bundle("en").pestActivity)) {
    const text = typeof value === "string" ? value : Object.values(value).join(" ");
    // "does not predict" and "never uses weather" are the disclaimers
    // themselves, so only affirmative claims are caught.
    assert.ok(
      !/\b(?:we|AGRI ONE)\s+(?:predict|forecast|expect)/i.test(text),
      `en/${key} makes a prediction`
    );
    assert.ok(
      !/\b(?:risk is|likely to|expected to|high risk|act now|urgent)\b/i.test(text),
      `en/${key} reads as a risk warning`
    );
  }
});

test("the page states outright that it does not predict or treat", async () => {
  for (const lang of LANGS) {
    await i18n.changeLanguage(lang);
    for (const key of ["pestActivity.notPredicted", "pestActivity.noTreatmentAdvice"]) {
      const text = i18n.t(key);
      assert.notEqual(text, key, `${lang}/${key} missing`);
      assert.ok(text.length > 40, `${lang}/${key} is suspiciously short`);
    }
  }
  // The English must actually name what it refuses to do.
  const en = bundle("en").pestActivity as unknown as Record<string, string>;
  assert.match(en.notPredicted, /does not predict/i);
  assert.match(en.notPredicted, /weather/i);
  assert.match(en.noTreatmentAdvice, /does not (give|provide) treatment advice/i);
});

test("the empty state never says the farm is free of pests", () => {
  // Absence of evidence in the farmer's own photos is not evidence of
  // absence in their field, and this is the sentence that has to carry
  // that distinction in every language.
  const en = bundle("en").pestActivity as unknown as Record<string, string>;
  assert.match(en.empty, /does not mean/i);

  // The copy has to be ABLE to mention pest-freedom in order to deny it,
  // so a bare substring test would flag the denial itself. Check instead
  // that any sentence raising the idea also negates it.
  const CLAIM = /free of pests|no pests|pest-free/i;
  for (const sentence of en.empty.split(/(?<=[.!?])\s+/)) {
    if (!CLAIM.test(sentence)) continue;
    assert.match(
      sentence,
      /\b(not|does not|never|n't)\b/i,
      `the empty state asserts the farm has no pests: "${sentence}"`
    );
  }
  // Every language needs a substantive sentence here, not a two-word one.
  for (const lang of LANGS) {
    const value = (bundle(lang).pestActivity as unknown as Record<string, string>).empty;
    assert.ok(value.length > 60, `${lang} empty state is too short to carry the caveat`);
  }
});

test("the two empty states are distinguishable", () => {
  for (const lang of LANGS) {
    const p = bundle(lang).pestActivity as unknown as Record<string, string>;
    assert.notEqual(
      p.empty,
      p.emptyNoScans,
      `${lang} uses one message for "no scans" and "no pests found"`
    );
  }
});

test("the Crop Diagnosis uncertainty wording this page reuses still exists", async () => {
  // Pest Activity deliberately borrows these rather than writing its own
  // confidence copy — if they move, this page silently loses its caveats.
  for (const lang of LANGS) {
    await i18n.changeLanguage(lang);
    for (const key of [
      "scanCrop.confidenceLevel.high",
      "scanCrop.confidenceLevel.medium",
      "scanCrop.confidenceLevel.low",
      "scanCrop.modelEstimate",
      "scanCrop.notCalibratedNote",
      "scanCrop.consultExpert",
      "scanCrop.noFarm",
      "scanHistory.unknownCrop",
      "soil.selectFarm",
      "nav.scanCrop",
      "farms.add",
      "common.loading"
    ]) {
      const text = i18n.t(key, PARAMS);
      assert.notEqual(text, key, `${lang}/${key} missing`);
      assert.ok(!text.includes("{{"), `${lang}/${key} left a placeholder`);
    }
  }
});

test("the navigation label matches what the page is", async () => {
  for (const lang of LANGS) {
    await i18n.changeLanguage(lang);
    const nav = i18n.t("nav.pestAlerts");
    assert.notEqual(nav, "nav.pestAlerts", `${lang} nav label missing`);
  }
  // "Alerts" promises a push signal this feature does not have.
  assert.ok(
    !/alert/i.test(bundle("en").nav.pestAlerts as unknown as string),
    "the English nav label still promises alerts"
  );
});
