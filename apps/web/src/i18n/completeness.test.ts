import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import i18next from "i18next";

/**
 * Whole-bundle parity across all four languages.
 *
 * Each module has its own i18n test, but those only cover the namespace
 * they know about — so a key added to English in a shared area (the nav,
 * a new page, an error state) could ship translated in one language and
 * raw in another, and nothing would catch it. This asserts the four
 * bundles describe exactly the same set of keys, and that every one of
 * them renders.
 *
 * It is deliberately blunt: parity, resolution, no leftover
 * placeholders. Meaning is each module's own test's job.
 */

const LANGS = ["en", "ta", "te", "hi"] as const;

type Json = Record<string, unknown>;
const bundle = (lang: string): Json =>
  JSON.parse(fs.readFileSync(`public/locales/${lang}/common.json`, "utf8")) as Json;

/** Every leaf key, dotted. i18next plural suffixes are kept as-is. */
function leaves(obj: Json, prefix = "", out: string[] = []): string[] {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) leaves(v as Json, key, out);
    else out.push(key);
  }
  return out;
}

const keysByLang = Object.fromEntries(
  LANGS.map((l) => [l, new Set(leaves(bundle(l)))])
) as Record<(typeof LANGS)[number], Set<string>>;

test("every language defines exactly the same keys", () => {
  const en = keysByLang.en;
  assert.ok(en.size > 100, `only ${en.size} keys found — did the bundle load?`);

  for (const lang of LANGS) {
    if (lang === "en") continue;
    const missing = [...en].filter((k) => !keysByLang[lang].has(k));
    const extra = [...keysByLang[lang]].filter((k) => !en.has(k));
    assert.deepEqual(missing, [], `${lang} is missing ${missing.length} key(s): ${missing.slice(0, 6).join(", ")}`);
    assert.deepEqual(extra, [], `${lang} has ${extra.length} key(s) English does not: ${extra.slice(0, 6).join(", ")}`);
  }
});

test("every key renders in every language with no placeholder left behind", async () => {
  const i18n = i18next.createInstance();
  await i18n.init({
    lng: "en",
    fallbackLng: "en",
    defaultNS: "common",
    interpolation: { escapeValue: false },
    resources: Object.fromEntries(LANGS.map((l) => [l, { common: bundle(l) }]))
  });

  // Covers every placeholder used anywhere in the bundles. A key that
  // needs one not listed here will fail, which is the point: an
  // unfilled {{token}} reaches the farmer as literal braces.
  const PARAMS: Record<string, unknown> = {
    count: 2, temp: 28.7, humidity: 60, wind: 12, code: 3,
    maxTemp: 33.3, minTemp: 25.6, rainChance: 15, days: 90,
    date: "24 Sep 2026", reportedOn: "2026-09-24", testedOn: "2026-03-01",
    crop: "Tomato", variety: "Local", grade: "Local",
    price: 3000, low: 2500, high: 3000,
    market: "Sundarapuram", lowMarket: "Pollachi", highMarket: "Singanallur",
    district: "Coimbatore", state: "Tamil Nadu", source: "agmarknet-data.gov.in",
    total: 4, areaAcres: 2, cropCount: 2, crops: "Tomato, onion",
    values: "pH 6.5", sourceLabel: "Market", language: "English",
    condition: "Overcast", confidence: "low", percent: 81,
    time: "5:30 PM", name: "Farmer", email: "farmer@example.invalid",
    amount: 1200, margin: 500, income: 1700, expenses: 1200,
    quantity: 12, unit: "quintal", category: "Seed",
    // `value` is the farm area; `n` is the mandi count, a plain
    // interpolation rather than a plural (i18next pluralises on
    // `count`, which is listed above).
    value: 2, n: 9
  };

  for (const lang of LANGS) {
    await i18n.changeLanguage(lang);
    for (const key of keysByLang.en) {
      // i18next resolves the base key for plurals; asking for the
      // suffixed form directly is not meaningful.
      if (/_(zero|one|two|few|many|other)$/.test(key)) continue;
      const text = String(i18n.t(key, PARAMS as never));
      assert.notEqual(text, key, `${lang}/${key} did not resolve`);
      assert.ok(!text.includes("{{"), `${lang}/${key} left a placeholder: ${text}`);
      assert.ok(!/\bundefined\b/.test(text), `${lang}/${key} rendered undefined: ${text}`);
    }
  }
});

test("no bundle carries an empty string where copy is expected", () => {
  for (const lang of LANGS) {
    const b = bundle(lang);
    for (const key of leaves(b)) {
      const value = key.split(".").reduce<unknown>((acc, k) => (acc as Json)?.[k], b);
      assert.ok(
        typeof value === "string" && value.trim().length > 0,
        `${lang}/${key} is empty`
      );
    }
  }
});
