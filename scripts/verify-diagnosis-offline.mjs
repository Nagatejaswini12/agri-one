/**
 * OFFLINE verification of the built /api/diagnosis function.
 *
 * ────────────────────────────────────────────────────────────────────
 *  THIS IS NOT A LIVE ROBOFLOW TEST AND PROVES NOTHING ABOUT THE MODEL.
 *
 *  Both external legs are stubbed — the Supabase token check and the
 *  Roboflow inference — so this runs with no API key, no account and no
 *  network. Every prediction below is a FIXTURE defined in this file.
 *
 *  What this proves: the endpoint authenticates, validates its input,
 *  sends the right request, maps a response, and stays honest on every
 *  failure path — including never emitting chemical guidance.
 *
 *  What it does NOT prove: that Roboflow returns a sensible label for a
 *  real leaf, or that Roboflow can fetch a Supabase signed URL from
 *  Vercel's network. Both need ROBOFLOW_API_KEY and a real image.
 * ────────────────────────────────────────────────────────────────────
 *
 * Run `npm run build --workspace apps/web && npx vercel build --yes`
 * first, then `node scripts/verify-diagnosis-offline.mjs`.
 */

import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARTIFACT = path.join(REPO, ".vercel/output/functions/api/diagnosis.func/api/diagnosis.js");

const require_ = createRequire(import.meta.url);
let handler;
try {
  const mod = require_(ARTIFACT);
  handler = typeof mod === "function" ? mod : (mod.default ?? mod.handler);
} catch {
  console.error(`Build artifact not found at ${ARTIFACT}`);
  console.error("Run: npm run build --workspace apps/web && npx vercel build --yes");
  process.exit(1);
}
if (typeof handler !== "function") {
  console.error("The artifact exports no handler function.");
  process.exit(1);
}

const VALID_TOKEN = "offline-fixture-valid-token";
const IMAGE_URL = "https://fixture.invalid/storage/v1/object/sign/crop-scans/a/b/c.jpg?token=fixture";

// ---- stubs ------------------------------------------------------------
const realFetch = globalThis.fetch;
let upstream = null;
let lastUpstreamUrl = null;
let upstreamCalls = 0;

globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input.url;
  if (url.includes("/auth/v1/user")) {
    const auth = init?.headers?.Authorization ?? init?.headers?.authorization ?? "";
    const ok = auth === `Bearer ${VALID_TOKEN}`;
    return new Response(JSON.stringify(ok ? { id: "fixture-user" } : { error: "invalid" }), {
      status: ok ? 200 : 401,
      headers: { "content-type": "application/json" }
    });
  }
  if (url.includes("roboflow.com")) {
    lastUpstreamUrl = url;
    upstreamCalls++;
    if (upstream) return upstream();
    throw new Error("offline: no upstream fixture configured");
  }
  throw new Error(`offline: unexpected external call to ${url}`);
};

process.env.SUPABASE_URL ??= "https://offline.invalid";
process.env.SUPABASE_ANON_KEY ??= "offline-fixture-anon-key";
process.env.ROBOFLOW_API_KEY = "offline-fixture-key-not-a-real-credential";

const call = (body, tok = VALID_TOKEN, method = "POST") =>
  handler(new Request("https://example.test/api/diagnosis", {
    method,
    headers: { "content-type": "application/json", ...(tok ? { authorization: `Bearer ${tok}` } : {}) },
    ...(method === "POST" ? { body: JSON.stringify(body) } : {})
  }));

const json = (o, status = 200) => () =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
const predict = (...ps) => json({ predictions: ps.map(([c, confidence]) => ({ class: c, confidence })) });

let pass = 0, fail = 0;
const check = (n, ok, d = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${n}${d ? " - " + d : ""}`); ok ? pass++ : fail++; };
const section = (s) => console.log(`\n${s}`);

console.log("OFFLINE endpoint checks - fixtures only, no network, no API key\n");
const bodies = [];

// ---- authentication ---------------------------------------------------
section("[OFFLINE] authentication");
check("GET is rejected", (await call({ imageUrl: IMAGE_URL }, VALID_TOKEN, "GET")).status === 405);
const noTok = await call({ imageUrl: IMAGE_URL }, null);
bodies.push(await noTok.clone().json());
check("a request with no token is refused", noTok.status === 401, String(noTok.status));
const badTok = await call({ imageUrl: IMAGE_URL }, "not-the-valid-token");
bodies.push(await badTok.clone().json());
check("a token Supabase rejects is refused", badTok.status === 401, String(badTok.status));
check("no inference was run for an unauthenticated caller", upstreamCalls === 0);

// ---- input validation -------------------------------------------------
section("[OFFLINE] input validation");
for (const [label, body] of [
  ["a missing image", {}],
  ["an empty image url", { imageUrl: "" }],
  ["a non-string image url", { imageUrl: 42 }],
  ["an http (not https) url", { imageUrl: "http://fixture.invalid/x.jpg" }],
  ["a file:// url", { imageUrl: "file:///etc/passwd" }],
  ["an internal address", { imageUrl: "http://169.254.169.254/latest/meta-data/" }]
]) {
  const r = await (await call(body)).json();
  bodies.push(r);
  check(`${label} is refused`, r.status === "unavailable", r.reason);
}
check("no inference is run for an invalid image url", upstreamCalls === 0);

// ---- the request actually sent ----------------------------------------
section("[OFFLINE] the request sent to the provider");
upstream = predict(["Tomato Early blight", 0.91]);
const okRes = await call({ imageUrl: IMAGE_URL, cropName: "Tomato", locale: "en" });
const ok = await okRes.json();
bodies.push(ok);
const sent = new URL(lastUpstreamUrl);
check("the model is crop-disease-axhjj/1", sent.pathname.endsWith("/crop-disease-axhjj/1"), sent.pathname);
check("the image is passed by URL", sent.searchParams.get("image") === IMAGE_URL);
check("an api_key is attached", !!sent.searchParams.get("api_key"));
check("exactly one inference was run", upstreamCalls === 1, String(upstreamCalls));

// ---- mapping ----------------------------------------------------------
section("[OFFLINE] response mapping (FIXTURE predictions, not live inference)");
check("status ok", ok.status === "ok", ok.reason ?? "");
if (ok.status === "ok") {
  check("the finding is reported", ok.data.primaryFinding.label === "Tomato Early blight");
  check("category is disease", ok.data.primaryFinding.category === "disease");
  check("cropName is echoed from the farm record", ok.data.cropName === "Tomato");
  check("source names the model", ok.source === "roboflow-crop-disease-axhjj-v1", ok.source);
  check("confidenceLevel is high", ok.data.confidenceLevel === "high");
}

upstream = predict(["Tomato Spider mites Two-spotted spider mite", 0.88]);
const pest = await (await call({ imageUrl: IMAGE_URL, cropName: "Tomato" })).json();
bodies.push(pest);
check("a mite is a PEST, not a disease",
  pest.status === "ok" && pest.data.primaryFinding.category === "pest",
  pest.status === "ok" ? pest.data.primaryFinding.category : pest.reason);

upstream = predict(["Tomato healthy", 0.96]);
const healthy = await (await call({ imageUrl: IMAGE_URL })).json();
bodies.push(healthy);
check("a healthy leaf is healthy",
  healthy.status === "ok" && healthy.data.primaryFinding.category === "healthy");

upstream = predict(["Tomato Early blight", 0.22]);
const lowConf = await (await call({ imageUrl: IMAGE_URL })).json();
bodies.push(lowConf);
check("a low-confidence prediction claims nothing",
  lowConf.status === "ok" && lowConf.data.primaryFinding.category === "inconclusive" &&
  lowConf.data.recommendExpertConsult === true);

upstream = json({ predictions: [] });
const empty = await (await call({ imageUrl: IMAGE_URL })).json();
bodies.push(empty);
check("no predictions is inconclusive, never a guessed label",
  empty.status === "ok" && empty.data.primaryFinding.category === "inconclusive");

// ---- upstream failure -------------------------------------------------
section("[OFFLINE] provider failure");
const failures = [];
for (const [label, stub] of [
  ["HTTP 401 (bad key)", json({ message: "Unauthorized api_key" }, 401)],
  ["HTTP 429", json({ message: "Too many requests" }, 429)],
  ["HTTP 500", json({ message: "server error" }, 500)],
  ["an undecodable image", json({ message: "Data pointed by URL could not be decoded into image" }, 400)],
  ["a network error", () => { throw new TypeError("fetch failed"); }],
  ["a non-JSON body", () => new Response("<html>nope</html>", { status: 200 })]
]) {
  upstream = stub;
  const r = await (await call({ imageUrl: IMAGE_URL })).json();
  failures.push(r);
  bodies.push(r);
  check(`${label} is reported honestly`, r.status === "unavailable", r.reason);
}
check("no failure path carries a finding", failures.every((r) => !("data" in r)));
check("the provider's own wording is never forwarded",
  failures.every((r) => !/unauthorized|api_key|too many|server error|decoded into image/i.test(r.reason)));

// ---- missing key ------------------------------------------------------
section("[OFFLINE] missing ROBOFLOW_API_KEY");
const saved = process.env.ROBOFLOW_API_KEY;
delete process.env.ROBOFLOW_API_KEY;
const before = upstreamCalls;
upstream = predict(["Tomato Early blight", 0.9]);
const noKey = await (await call({ imageUrl: IMAGE_URL })).json();
bodies.push(noKey);
check("it reports unavailable rather than any finding", noKey.status === "unavailable", noKey.reason);
check("no inference is attempted without a key", upstreamCalls === before);
check("the message names no key or provider", !/api_key|roboflow|ROBOFLOW/i.test(noKey.reason), noKey.reason);
process.env.ROBOFLOW_API_KEY = saved;

// ---- key containment --------------------------------------------------
section("[OFFLINE] key containment");
const all = JSON.stringify(bodies);
check("no response body contains the configured key value", !all.includes(saved));
check("no response body contains 'api_key'", !/api_key/i.test(all));
check("no response body carries the provider URL", !/roboflow\.com/i.test(all));

// ---- the no-chemical invariant ----------------------------------------
section("[OFFLINE] no chemical, product or dose is ever emitted");
const BANNED =
  /pesticide|insecticide|fungicide|herbicide|acaricide|miticide|spray|dosage|kg\/ha|ml\/l|neem oil|mancozeb|abamectin|imidacloprid|carbendazim/i;
check("no response body names a chemical or a dose", !BANNED.test(all));
check("careGuidance is never populated",
  bodies.filter((b) => b.status === "ok")
    .every((b) => b.data.careGuidance.culturalPractices.length === 0 &&
                  b.data.careGuidance.monitoring.length === 0));

globalThis.fetch = realFetch;
console.log(`\n${pass} passed, ${fail} failed`);
console.log("\nNOTE: every prediction above was a fixture. This run performed no");
console.log("live Roboflow inference and proves nothing about the model's accuracy.");
process.exit(fail ? 1 : 0);
