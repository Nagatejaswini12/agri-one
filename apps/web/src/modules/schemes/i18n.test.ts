import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import i18next from "i18next";

/**
 * The Government Schemes page is the first to use i18next pluralization,
 * and a plural key fails silently: i18next pluralizes on `count`, so
 * passing any other variable name resolves to no key at all and the raw
 * `schemes.stateSchemesSkipped` string is rendered to the farmer.
 *
 * That path is only reachable when a farm has no state saved, which the
 * browser test's farm does have — so it would ship untested. These
 * assertions cover it directly instead, in all four languages.
 */

const LANGS = ["en", "ta", "te", "hi"] as const;

function bundle(lang: string): Record<string, unknown> {
  return JSON.parse(
    fs.readFileSync(`public/locales/${lang}/common.json`, "utf8")
  ) as Record<string, unknown>;
}

const i18n = i18next.createInstance();
await i18n.init({
  lng: "en",
  fallbackLng: "en",
  defaultNS: "common",
  interpolation: { escapeValue: false },
  resources: Object.fromEntries(
    LANGS.map((l) => [l, { common: bundle(l) }])
  )
});

test("the skipped-state-schemes line pluralizes in every language", async () => {
  for (const lang of LANGS) {
    await i18n.changeLanguage(lang);
    for (const count of [1, 4]) {
      const text = i18n.t("schemes.stateSchemesSkipped", { count });
      assert.notEqual(text, "schemes.stateSchemesSkipped", `${lang}/${count} did not resolve`);
      assert.ok(text.includes(String(count)), `${lang}/${count} dropped the number`);
      assert.ok(!text.includes("{{"), `${lang}/${count} left a placeholder unfilled`);
    }
  }
});

test("every criterion label resolves in every language", async () => {
  const keys = Object.keys((bundle("en").schemes as Record<string, Record<string, string>>).criteria);
  assert.ok(keys.length > 0);
  for (const lang of LANGS) {
    await i18n.changeLanguage(lang);
    for (const key of keys) {
      const text = i18n.t(`schemes.criteria.${key}`, { state: "Tamil Nadu", acres: 2 });
      assert.notEqual(text, `schemes.criteria.${key}`, `${lang}/${key} did not resolve`);
      assert.ok(!text.includes("{{"), `${lang}/${key} left a placeholder unfilled`);
    }
  }
});

test("group, level and status labels resolve in every language", async () => {
  for (const lang of LANGS) {
    await i18n.changeLanguage(lang);
    for (const key of [
      "schemes.group.matched",
      "schemes.group.needs_check",
      "schemes.group.other",
      "schemes.groupHint.matched",
      "schemes.groupHint.needs_check",
      "schemes.groupHint.other",
      "schemes.level.central",
      "schemes.level.state",
      "schemes.status.matched",
      "schemes.status.not_matched",
      "schemes.status.cannot_check",
      "schemes.disclaimer",
      "schemes.youMustCheck",
      "schemes.officialLink"
    ]) {
      assert.notEqual(i18n.t(key), key, `${lang}/${key} did not resolve`);
    }
  }
});
