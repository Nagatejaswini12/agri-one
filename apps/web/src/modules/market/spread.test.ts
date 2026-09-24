import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

/**
 * Regression tests for the market-spread correctness fix.
 *
 * AGMARKNET returns several varieties of one commodity side by side and
 * their prices are not comparable. Before this fix, both the Decision
 * Agent and the chat assistant ranked across all of them: Madurai onion
 * on 2026-09-24 would have been reported as ranging from Rs 4,500
 * (Bellary) to Rs 8,700 (Onion Green), and Pune as Rs 10 to Rs 2,850 in
 * the *same* mandi. Both read as "you could get far more elsewhere" when
 * the real difference is that it is a different product.
 *
 * The grouping function lives inside the two n8n Code node sources,
 * which cannot be imported. These tests read it straight out of the
 * shipped source and evaluate it, so what is asserted is exactly what
 * n8n runs — and they assert both copies are identical.
 */

const DECISION_SRC = "../../services/n8n/workflows/src/decision/node-apply-rules.js";
const CHAT_SRC = "../../services/n8n/workflows/src/chat/node-build-answer.js";

interface Group {
  variety: string | null;
  grade: string | null;
  quotes: { market: string; price: number }[];
}
type GroupFn = (quotes: unknown) => Group[];

function extract(path: string): string {
  const src = fs.readFileSync(path, "utf8");
  const start = src.indexOf("function groupComparableQuotes");
  assert.ok(start >= 0, `groupComparableQuotes not found in ${path}`);
  const end = src.indexOf("\n}", start) + 2;
  return src.slice(start, end);
}

const decisionFn = extract(DECISION_SRC);
const chatFn = extract(CHAT_SRC);

const groupComparableQuotes = new Function(
  `${decisionFn}; return groupComparableQuotes;`
)() as GroupFn;

const q = (
  market: string,
  price: number | null,
  variety: string | null = "Local",
  grade: string | null = "FAQ"
) => ({ market, modalPrice: price, variety, grade });

/** The widest qualifying spread, using the shipped 15% threshold. */
function spreadOf(quotes: unknown, threshold = 0.15) {
  let widest = null;
  let widestRatio = 0;
  for (const g of groupComparableQuotes(quotes)) {
    if (g.quotes.length < 2) continue;
    let low = g.quotes[0];
    let high = g.quotes[0];
    for (const item of g.quotes) {
      if (item.price < low.price) low = item;
      if (item.price > high.price) high = item;
    }
    if (low.price <= 0) continue;
    const ratio = (high.price - low.price) / low.price;
    if (ratio >= threshold && ratio > widestRatio) {
      widestRatio = ratio;
      widest = { group: g, low, high };
    }
  }
  return widest;
}

test("the decision and chat copies of the grouping function are identical", () => {
  assert.equal(decisionFn, chatFn);
});

test("same variety and grade can produce a spread", () => {
  const spread = spreadOf([
    q("Mettupalayam", 2500, "Deshi", "Local"),
    q("Singanallur", 3150, "Deshi", "Local")
  ]);
  assert.ok(spread, "expected a spread within one variety");
  assert.equal(spread.low.price, 2500);
  assert.equal(spread.high.price, 3150);
  assert.equal(spread.group.variety, "Deshi");
});

test("different varieties do NOT produce a spread", () => {
  // The real Madurai case: Bellary and Onion Green are different
  // products, so the gap between them is not a spread.
  const spread = spreadOf([
    q("Melur", 4500, "Bellary", "Local"),
    q("Anna nagar", 8700, "Onion Green", "Local")
  ]);
  assert.equal(spread, null);
});

test("different grades do NOT produce a spread", () => {
  const spread = spreadOf([
    q("Mandi A", 2000, "Local", "FAQ"),
    q("Mandi B", 3000, "Local", "Non-FAQ")
  ]);
  assert.equal(spread, null);
});

test("the real Pune case cannot report a 10-to-2850 spread", () => {
  // Same mandi, same day: Local at 2850 and "Other" at 10.
  const spread = spreadOf([
    q("APMC Pune", 2850, "Local", "Local"),
    q("Pune(Moshi)", 3000, "Local", "Local"),
    q("APMC Pune", 10, "Other", "Local"),
    q("Pune(Moshi)", 18, "Other", "Local")
  ]);
  assert.ok(spread);
  // Whichever group wins, both ends must share a variety.
  assert.equal(spread.low.price > 100, spread.high.price > 100);
  assert.ok(!(spread.low.price === 10 && spread.high.price === 2850));
});

test("quotes with a missing modal price are ignored", () => {
  const groups = groupComparableQuotes([
    q("A", null, "Local", "FAQ"),
    q("B", 1000, "Local", "FAQ"),
    q("C", 1500, "Local", "FAQ")
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].quotes.length, 2);
  assert.ok(!groups[0].quotes.some((item) => item.price === null));
});

test("a non-numeric modal price is ignored, never coerced", () => {
  const groups = groupComparableQuotes([
    { market: "A", modalPrice: "2000", variety: "Local", grade: "FAQ" },
    { market: "B", modalPrice: Number.NaN, variety: "Local", grade: "FAQ" },
    q("C", 2500, "Local", "FAQ")
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].quotes.length, 1);
  assert.equal(groups[0].quotes[0].market, "C");
});

test("fewer than two comparable quotes produces no spread", () => {
  assert.equal(spreadOf([q("Only", 3000, "Local", "FAQ")]), null);
  // Two quotes, but in different groups — neither group has two.
  assert.equal(
    spreadOf([q("A", 1000, "Local", "FAQ"), q("B", 5000, "Bellary", "FAQ")]),
    null
  );
});

test("a spread below the threshold is not reported", () => {
  // 3000 -> 3150 is 5%, under the 15% bar.
  assert.equal(spreadOf([q("A", 3000), q("B", 3150)]), null);
});

test("a quote with no mandi name is dropped", () => {
  const groups = groupComparableQuotes([q("  ", 1000), q("Real", 2000)]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].quotes.length, 1);
  assert.equal(groups[0].quotes[0].market, "Real");
});

test("a missing variety groups separately from a named one", () => {
  const groups = groupComparableQuotes([
    q("A", 1000, null, "FAQ"),
    q("B", 5000, "Local", "FAQ")
  ]);
  assert.equal(groups.length, 2);
  assert.equal(groups.find((g) => g.variety === null)?.quotes.length, 1);
});

test("the same mandi under two varieties stays two entries, not one", () => {
  // Madurai really does report Anaiyur twice, for two products.
  const groups = groupComparableQuotes([
    q("Anaiyur", 6250, "Bellary", "Local"),
    q("Anaiyur", 8250, "Onion Green", "Local")
  ]);
  assert.equal(groups.length, 2);
  assert.ok(groups.every((g) => g.quotes.length === 1));
  assert.ok(groups.every((g) => g.quotes[0].market === "Anaiyur"));
});

test("group order is stable, so the reported spread is deterministic", () => {
  const input = [
    q("A", 1000, "Local", "FAQ"),
    q("B", 2000, "Bellary", "FAQ"),
    q("C", 1500, "Local", "FAQ")
  ];
  const first = groupComparableQuotes(input).map((g) => g.variety);
  const second = groupComparableQuotes(input).map((g) => g.variety);
  assert.deepEqual(first, second);
  assert.deepEqual(first, ["Local", "Bellary"]);
});

test("empty and malformed input produce no groups, not a crash", () => {
  for (const input of [undefined, null, [], "nonsense", [null, 42, {}]]) {
    assert.deepEqual(groupComparableQuotes(input), []);
  }
});
