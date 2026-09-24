import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

/**
 * Guards the fix for a bug that showed farmers raw i18n keys.
 *
 * i18n starts with no resources, so if the app renders before the
 * language bundle is loaded, every screen paints `nav.pestAlerts`
 * instead of "Pest Activity". That was expected to self-correct, but
 * `loadLanguage()` finishes by calling `changeLanguage()` with the
 * language i18next already has, which emits no `languageChanged` event —
 * so components that had already mounted never re-rendered and the raw
 * keys stayed on screen indefinitely. It reproduced on roughly one page
 * load in five.
 *
 * These are source-level assertions, not behavioural ones: the race is a
 * browser render-ordering problem that a unit test cannot observe. They
 * exist so the ordering cannot be quietly undone — the browser harness
 * is what proves the behaviour.
 */

const MAIN = "src/main.tsx";
const I18N = "src/i18n/index.ts";

test("the app loads the language bundle before the first render", () => {
  const src = fs.readFileSync(MAIN, "utf8");

  const awaitAt = src.indexOf("await loadLanguage");
  const renderAt = src.indexOf("createRoot(");
  assert.ok(awaitAt >= 0, "main.tsx no longer awaits loadLanguage");
  assert.ok(renderAt >= 0, "main.tsx no longer calls createRoot");
  assert.ok(
    awaitAt < renderAt,
    "createRoot runs before the language bundle is awaited — raw keys will paint"
  );

  // The fire-and-forget form is what caused the bug.
  assert.ok(
    !/void loadLanguage\(/.test(src),
    "loadLanguage is fire-and-forget again; the first render can beat the bundle"
  );
});

test("a failed bundle fetch still renders the app", () => {
  // A farmer with a flaky connection must get an English app, not a
  // blank page.
  const src = fs.readFileSync(MAIN, "utf8");
  assert.match(src, /try\s*{[\s\S]*await loadLanguage[\s\S]*}\s*catch/, "the await is unguarded");
  const catchAt = src.search(/}\s*catch/);
  assert.ok(src.indexOf("createRoot(") > catchAt, "createRoot is inside the try, so a fetch failure skips it");
});

test("react-i18next re-renders when a bundle is added, not only on language change", () => {
  const src = fs.readFileSync(I18N, "utf8");
  assert.match(
    src,
    /bindI18nStore:\s*["']added["']/,
    "bindI18nStore is gone; a late bundle can leave mounted components on raw keys"
  );
});

test("loadLanguage still adds the bundle before switching to it", () => {
  // Match the call sites, not the prose: the comment above this code
  // names both functions, so a bare indexOf finds the explanation
  // rather than the calls.
  const src = fs.readFileSync(I18N, "utf8");
  const add = src.indexOf("i18n.addResourceBundle(");
  const change = src.indexOf("i18n.changeLanguage(");
  assert.ok(add >= 0, "addResourceBundle call not found");
  assert.ok(change >= 0, "changeLanguage call not found");
  assert.ok(add < change, "changeLanguage runs before the bundle is added");
});
