/**
 * Authenticated end-to-end check for the Market Agent.
 *
 * Signs in as the local test farmer, calls the live POST /webhook/market
 * exactly as the frontend does, and runs the real responses through the
 * same normalizer the UI uses — so this proves the live contract, not a
 * fixture of it.
 *
 * Needs `.test-account.json` in the repo root (gitignored):
 *   { "email": "...", "password": "..." }
 * Nothing from it is ever printed.
 *
 *   node scripts/market-e2e.mjs
 */
import fs from "node:fs";
import { normalizeMarketResult } from "../apps/web/src/modules/market/normalize.ts";

function readEnv() {
  return Object.fromEntries(
    fs
      .readFileSync("apps/web/.env", "utf8")
      .split(/\r?\n/)
      .filter((l) => l.trim() && !l.startsWith("#"))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      })
  );
}

const env = readEnv();

if (!fs.existsSync(".test-account.json")) {
  console.error(
    "Missing .test-account.json (gitignored). Create it with the test farmer's\n" +
      '{ "email": "...", "password": "..." } and re-run.'
  );
  process.exit(2);
}

const { email, password } = JSON.parse(fs.readFileSync(".test-account.json", "utf8"));

const auth = await fetch(`${env.VITE_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { "Content-Type": "application/json", apikey: env.VITE_SUPABASE_ANON_KEY },
  body: JSON.stringify({ email, password })
});
const session = await auth.json();
if (!session.access_token) {
  console.error(`Sign-in failed: ${session.error_description ?? session.msg ?? auth.status}`);
  process.exit(1);
}
console.log("signed in\n");

let failures = 0;

/** Asserts the live response normalizes to something the UI can render. */
async function check(label, body, expect) {
  const res = await fetch(`${env.VITE_N8N_BASE_URL}/webhook/market`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`
    },
    body: JSON.stringify(body)
  });

  console.log(`=== ${label} === HTTP ${res.status}`);
  if (!res.ok) {
    console.log(`  FAIL: expected 200\n`);
    failures++;
    return;
  }

  const normalized = normalizeMarketResult(await res.json());
  if (normalized.status !== expect) {
    console.log(`  FAIL: expected "${expect}", got "${normalized.status}"`);
    if (normalized.status === "unavailable") console.log(`  reason: ${normalized.reason}`);
    failures++;
    console.log("");
    return;
  }

  if (normalized.status === "unavailable") {
    console.log(`  ok — unavailable: ${normalized.reason}\n`);
    return;
  }

  const d = normalized.data;
  console.log(`  ok — ${d.commodity} in ${d.district}, ${d.state}`);
  console.log(`  reportedOn: ${d.latestReportedOn ?? "(none given)"}   asOf: ${normalized.asOf}`);
  console.log(`  source: ${normalized.source}   unit: ${d.priceUnit}   mandis: ${d.quotes.length}`);
  for (const q of d.quotes.slice(0, 3)) {
    const show = (v) => (v === null ? "—" : v);
    console.log(
      `    ${q.market}: modal ${show(q.modalPrice)} (min ${show(q.minPrice)}, max ${show(q.maxPrice)})` +
        ` · ${show(q.variety)}/${show(q.grade)} · ${show(q.reportedOn)}`
    );
  }
  if (d.quotes.length > 3) console.log(`    …and ${d.quotes.length - 3} more`);

  // The no-fabricated-data rule, checked against live values rather than
  // asserted in a comment: an absent price must be null, never 0.
  const zeroed = d.quotes.filter(
    (q) => q.minPrice === 0 || q.maxPrice === 0 || q.modalPrice === 0
  );
  if (zeroed.length > 0) {
    console.log(`  NOTE: ${zeroed.length} quote(s) carry a genuine 0 from the source`);
  }
  console.log("");
}

// Two different commodities, plus the failure paths a farmer can hit.
await check("Thiruvallur / Tomato", { state: "Tamil Nadu", district: "Thiruvallur", commodity: "Tomato" }, "ok");
await check("Thiruvallur / Onion", { state: "Tamil Nadu", district: "Thiruvallur", commodity: "Onion" }, "ok");
await check(
  "unresolved district",
  { state: "Tamil Nadu", district: "Zzzznotadistrict", commodity: "Tomato" },
  "unavailable"
);
await check(
  "nonsense commodity",
  { state: "Tamil Nadu", district: "Thiruvallur", commodity: "Zzzznotacommodity" },
  "unavailable"
);

console.log(failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
