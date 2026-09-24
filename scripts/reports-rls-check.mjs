/**
 * Proves row-level security on the Reports tables.
 *
 * Reports is the first module storing money, so the isolation is tested
 * rather than assumed. Four things are checked:
 *
 *   1. The tables exist and the `authenticated` GRANT is in place —
 *      without the base grant, RLS policies are never even evaluated and
 *      every request fails with 42501.
 *   2. An unauthenticated caller (anon key only) gets nothing.
 *   3. A signed-in farmer cannot write a row against a farm they do not
 *      own. This is the cross-farmer case, provable with one account:
 *      the policy's WITH CHECK must reject a foreign farm_id.
 *   4. A farmer's own insert, read and delete all work, and every row
 *      that comes back belongs to one of their own farms.
 *
 * Needs `.test-account.json` in the repo root (gitignored). Nothing from
 * it is ever printed. Rows created here are deleted again at the end.
 *
 *   node scripts/reports-rls-check.mjs
 */
import fs from "node:fs";

const env = Object.fromEntries(
  fs
    .readFileSync("apps/web/.env", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

if (!fs.existsSync(".test-account.json")) {
  console.error("Missing .test-account.json (gitignored).");
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
  console.error("Sign-in failed.");
  process.exit(1);
}
console.log("signed in\n");

const authed = {
  apikey: env.VITE_SUPABASE_ANON_KEY,
  Authorization: `Bearer ${session.access_token}`,
  "Content-Type": "application/json",
  Prefer: "return=representation"
};
const anon = { apikey: env.VITE_SUPABASE_ANON_KEY, "Content-Type": "application/json" };

let failures = 0;
const check = (label, cond, detail = "") => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures += 1;
};

const rest = (path, init = {}) =>
  fetch(`${env.VITE_SUPABASE_URL}/rest/v1/${path}`, { headers: authed, ...init });

const TABLES = ["farm_financial_records", "yield_records"];

// --- 1. tables exist and are granted ---------------------------------
console.log("=== tables and GRANT ===");
let migrationApplied = true;
for (const table of TABLES) {
  const res = await rest(`${table}?select=id&limit=1`);
  const body = await res.text();
  if (/does not exist|schema cache/i.test(body)) {
    check(`${table} exists`, false, "not created — apply the migration first");
    migrationApplied = false;
  } else if (/permission denied/i.test(body) || body.includes("42501")) {
    check(`${table} is granted to authenticated`, false, "42501 — the GRANT is missing");
    migrationApplied = false;
  } else {
    check(`${table} exists and is readable`, res.status === 200, `HTTP ${res.status}`);
  }
}
if (!migrationApplied) {
  console.log("\nMigration not applied — stopping before the isolation checks.");
  process.exit(1);
}

// --- 2. anonymous access -------------------------------------------
console.log("\n=== unauthenticated access ===");
for (const table of TABLES) {
  const res = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/${table}?select=id`, { headers: anon });
  let rows = [];
  try {
    rows = await res.json();
  } catch {
    rows = [];
  }
  const blocked = res.status === 401 || (Array.isArray(rows) && rows.length === 0);
  check(`anon sees no ${table}`, blocked, `HTTP ${res.status}, ${Array.isArray(rows) ? rows.length : "?"} rows`);
}

// --- 3. writing against someone else's farm --------------------------
console.log("\n=== cross-farm write is rejected ===");
const farms = await (await rest("farms?select=id,name")).json();
if (!Array.isArray(farms) || farms.length === 0) {
  check("test account has a farm to work with", false, "seed a farm first");
  process.exit(1);
}
const myFarm = farms[0];

// A farm id that is certainly not this farmer's.
const FOREIGN_FARM = "00000000-0000-4000-8000-000000000000";
const foreign = await rest("farm_financial_records", {
  method: "POST",
  body: JSON.stringify({
    farm_id: FOREIGN_FARM,
    type: "cost",
    category: "seed",
    amount: 1,
    recorded_on: "2026-09-24"
  })
});
const foreignBody = await foreign.text();
check(
  "insert against a farm the farmer does not own is refused",
  foreign.status >= 400,
  `HTTP ${foreign.status}`
);
check(
  "refusal comes from the policy, not a crash",
  /row-level security|violates|foreign key/i.test(foreignBody),
  foreignBody.slice(0, 80)
);

// --- 4. the farmer's own round trip ----------------------------------
console.log("\n=== the farmer's own rows ===");
const crops = await (await rest(`farm_crops?select=id&farm_id=eq.${myFarm.id}&limit=1`)).json();

const created = await rest("farm_financial_records", {
  method: "POST",
  body: JSON.stringify({
    farm_id: myFarm.id,
    crop_id: null,
    type: "revenue",
    category: "sale",
    amount: 1234.5,
    recorded_on: "2026-09-24",
    notes: "rls-check temporary row"
  })
});
const createdRows = await created.json();
check("own insert succeeds", created.status < 300 && Array.isArray(createdRows) && createdRows.length === 1, `HTTP ${created.status}`);
const financialId = createdRows?.[0]?.id ?? null;

let yieldId = null;
if (Array.isArray(crops) && crops.length > 0) {
  const y = await rest("yield_records", {
    method: "POST",
    body: JSON.stringify({
      farm_id: myFarm.id,
      crop_id: crops[0].id,
      quantity: 7.5,
      unit: "quintal",
      harvested_on: "2026-09-24"
    })
  });
  const yRows = await y.json();
  check("own yield insert succeeds", y.status < 300 && Array.isArray(yRows) && yRows.length === 1, `HTTP ${y.status}`);
  yieldId = yRows?.[0]?.id ?? null;
} else {
  console.log("  SKIP  own yield insert — the test farm has no crops");
}

const myFarmIds = new Set(farms.map((f) => f.id));
for (const table of TABLES) {
  const rows = await (await rest(`${table}?select=id,farm_id`)).json();
  const allMine = Array.isArray(rows) && rows.every((r) => myFarmIds.has(r.farm_id));
  check(`every ${table} row returned belongs to this farmer`, allMine, `${rows.length ?? 0} rows`);
}

// --- cleanup ---------------------------------------------------------
if (financialId) {
  const del = await rest(`farm_financial_records?id=eq.${financialId}`, { method: "DELETE" });
  check("own delete succeeds", del.status < 300, `HTTP ${del.status}`);
}
if (yieldId) {
  await rest(`yield_records?id=eq.${yieldId}`, { method: "DELETE" });
}

console.log(`\n${failures === 0 ? "ALL RLS CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
