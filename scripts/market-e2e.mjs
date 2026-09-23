/**
 * Authenticated end-to-end check for the Market Agent.
 *
 * Signs in as the local test farmer, calls the live POST /webhook/market
 * exactly as the frontend does, and runs the real responses through the
 * same normalizer the UI uses — so this proves the live contract, not a
 * fixture of it.
 *
 * WHY A ZERO-RECORD DAY IS A PASS
 * -------------------------------
 * AGMARKNET publishes one snapshot per day, built from mandi arrivals
 * that were actually reported. A district with no arrivals that day — a
 * holiday, a closed yard, a late publication — legitimately returns zero
 * records, and the agent correctly answers "no market data was reported
 * today". Asserting that a given district must have data on the day the
 * test runs asserts something about Indian mandi activity, not about
 * this codebase, and it fails for a reason no code change can fix.
 *
 * Observed 2026-09-23: Thiruvallur returned zero records all day while
 * Coimbatore, Madurai, Pune and Agra all returned live quotes. Nothing
 * was wrong with the agent.
 *
 * So a per-district query accepts either real quotes or an honest
 * "nothing reported today". What it never accepts is a transport
 * failure, an API failure, a malformed payload or a broken DataResult —
 * those are real defects and still fail the run.
 *
 * To keep the test meaningful rather than merely permissive, a panel of
 * districts is queried and **at least one must return real quotes**.
 * That proves the pipeline genuinely reaches AGMARKNET and renders live
 * prices today. Each query runs exactly once, in a fixed order: there
 * are no retries, because a retry would hide exactly the intermittent
 * transport failures this test exists to catch.
 *
 * Needs `.test-account.json` in the repo root (gitignored), holding the
 * test farmer's email and password. Nothing from it is ever printed.
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
      "email and password, then re-run."
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
const fail = (msg) => {
  console.log(`  FAIL: ${msg}`);
  failures += 1;
};

/** Returns a message when a successful payload breaks the contract. */
function contractViolation(normalized) {
  const d = normalized.data;
  if (!normalized.asOf || Number.isNaN(Date.parse(normalized.asOf))) {
    return "asOf is not a timestamp";
  }
  if (normalized.source !== "agmarknet-data.gov.in") {
    return `unexpected source "${normalized.source}"`;
  }
  if (!d.commodity || !d.state || !d.district) return "commodity/state/district missing";
  if (d.priceUnit !== "INR_PER_QUINTAL") return `unexpected priceUnit "${d.priceUnit}"`;
  if (!Array.isArray(d.quotes) || d.quotes.length === 0) return "ok result carried no quotes";
  if (d.latestReportedOn !== null && !/^\d{4}-\d{2}-\d{2}$/.test(d.latestReportedOn)) {
    return `latestReportedOn "${d.latestReportedOn}" is not YYYY-MM-DD`;
  }

  for (const q of d.quotes) {
    if (typeof q.market !== "string" || q.market.trim() === "") {
      return "a quote has no mandi name";
    }
    for (const field of ["minPrice", "maxPrice", "modalPrice"]) {
      const v = q[field];
      // null is the honest "not reported". A number must be real and
      // finite — never NaN, and never an invented substitute.
      if (v !== null && (typeof v !== "number" || !Number.isFinite(v))) {
        return `quote ${q.market} has a non-numeric ${field}`;
      }
    }
    if (q.reportedOn !== null && !/^\d{4}-\d{2}-\d{2}$/.test(q.reportedOn)) {
      return `quote ${q.market} has reportedOn "${q.reportedOn}"`;
    }
  }

  const serialized = JSON.stringify(d);
  if (serialized.includes("undefined") || serialized.includes("NaN")) {
    return "payload contains undefined/NaN";
  }
  return null;
}

/**
 * Classifies one live response.
 *
 * The three "unavailable" reasons are told apart by their text because
 * that is the only signal the contract carries — Market - Core is a
 * completed module and is not changed to suit this test. The coupling is
 * narrow and deliberate: if those strings are ever reworded, this
 * classifier must be updated with them.
 */
function classify(res, raw) {
  if (!res.ok) return { kind: "httpFailure", detail: `HTTP ${res.status}` };

  let normalized;
  try {
    normalized = normalizeMarketResult(raw);
  } catch (err) {
    return { kind: "malformed", detail: err.message };
  }

  if (normalized.status === "ok") {
    const violation = contractViolation(normalized);
    if (violation) return { kind: "contract", detail: violation };
    return { kind: "priced", normalized };
  }

  const reason = normalized.reason ?? "";
  if (/No market data was reported today/i.test(reason)) {
    return { kind: "noRecords", detail: reason };
  }
  if (
    /No market district matching/i.test(reason) ||
    /No market data source matches the state/i.test(reason)
  ) {
    return { kind: "unresolved", detail: reason };
  }
  if (/currently unavailable/i.test(reason)) {
    return { kind: "serviceUnavailable", detail: reason };
  }
  return { kind: "unknownReason", detail: reason };
}

async function query(body) {
  const res = await fetch(`${env.VITE_N8N_BASE_URL}/webhook/market`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`
    },
    body: JSON.stringify(body)
  });
  let raw = null;
  try {
    raw = await res.json();
  } catch {
    return { kind: "malformed", detail: "response was not JSON" };
  }
  return classify(res, raw);
}

function describe(outcome) {
  if (outcome.kind !== "priced") return outcome.detail ?? outcome.kind;
  const d = outcome.normalized.data;
  const top = d.quotes[0];
  return (
    `${d.quotes.length} mandis in ${d.district}, reportedOn ${d.latestReportedOn ?? "(none)"}` +
    ` — e.g. ${top.market} modal ${top.modalPrice ?? "—"}`
  );
}

/**
 * A real farm query. Either live quotes or an honest zero-record day is
 * correct; anything else is a defect.
 */
async function checkDistrict(label, body) {
  const outcome = await query(body);
  const ok = outcome.kind === "priced" || outcome.kind === "noRecords";
  console.log(`=== ${label} === ${ok ? outcome.kind : "FAILED"}`);
  console.log(`  ${describe(outcome)}`);
  if (!ok) fail(`${label}: ${outcome.kind} — ${outcome.detail ?? ""}`);
  console.log("");
  return outcome;
}

/** Asserts one exact outcome, for the deliberately-invalid inputs. */
async function checkExact(label, body, expected) {
  const outcome = await query(body);
  const ok = outcome.kind === expected;
  console.log(`=== ${label} === ${outcome.kind}`);
  console.log(`  ${describe(outcome)}`);
  if (!ok) fail(`${label}: expected ${expected}, got ${outcome.kind}`);
  console.log("");
}

// --- 1. The pipeline must return real quotes somewhere today ----------
// A panel, because any single district can legitimately be empty. These
// are high-volume districts across three states; each is queried once.
const PANEL = [
  ["Coimbatore / Tomato", { state: "Tamil Nadu", district: "Coimbatore", commodity: "Tomato" }],
  ["Madurai / Onion", { state: "Tamil Nadu", district: "Madurai", commodity: "Onion" }],
  ["Pune / Onion", { state: "Maharashtra", district: "Pune", commodity: "Onion" }],
  ["Agra / Potato", { state: "Uttar Pradesh", district: "Agra", commodity: "Potato" }]
];

let pricedCount = 0;
for (const [label, body] of PANEL) {
  const outcome = await checkDistrict(label, body);
  if (outcome.kind === "priced") pricedCount += 1;
}

if (pricedCount === 0) {
  fail(
    "no district in the panel returned live quotes — either the pipeline is " +
      "not reaching AGMARKNET, or every panel district is empty today"
  );
} else {
  console.log(`panel: ${pricedCount}/${PANEL.length} districts returned live quotes\n`);
}

// --- 2. A farm district that is known to go quiet ---------------------
await checkDistrict("Thiruvallur / Tomato", {
  state: "Tamil Nadu",
  district: "Thiruvallur",
  commodity: "Tomato"
});

// --- 3. Inputs that must resolve to one specific outcome --------------
await checkExact(
  "unresolved district",
  { state: "Tamil Nadu", district: "Zzzznotadistrict", commodity: "Tomato" },
  "unresolved"
);
await checkExact(
  "nonsense commodity",
  { state: "Tamil Nadu", district: "Coimbatore", commodity: "Zzzznotacommodity" },
  "noRecords"
);

console.log(failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
