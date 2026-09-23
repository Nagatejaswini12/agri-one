/**
 * Guards the chat assistant against three kinds of drift:
 *
 *  1. The readable node sources under
 *     services/n8n/workflows/src/chat/ vs the escaped jsCode actually
 *     embedded in the exported workflow JSON. The answer builder and the
 *     intent table are the safety-relevant code here; reviewing them
 *     inside a one-line escaped string is not reviewing them.
 *  2. Every answerKey the builder can emit has a label in all four
 *     locale bundles. A missing one would be read aloud to a farmer as a
 *     raw `chat.answer.…` key.
 *  3. The builder keeps to its contract: no prose field, no LLM, no
 *     route to Crop Diagnosis, and no branching on soil values (which is
 *     the line between reporting a record and prescribing a treatment).
 *
 *   node scripts/verify-chat-answers.mjs
 */
import fs from "node:fs";

const SRC = "services/n8n/workflows/src/chat";
const WF = "services/n8n/workflows";
const LANGS = ["en", "ta", "te", "hi"];

let failures = 0;
function check(label, cond, detail = "") {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
}

const read = (p) => fs.readFileSync(p, "utf8");
const nodeOf = (wfFile, nodeName) => {
  const wf = JSON.parse(read(`${WF}/${wfFile}`));
  const n = wf.nodes.find((x) => x.name === nodeName);
  if (!n) throw new Error(`${wfFile}: no node named ${nodeName}`);
  return n;
};

console.log("=== exported workflow jsCode matches the readable sources ===");
for (const [node, source] of [
  ["Normalize Input", "node-normalize-input.js"],
  ["Classify Intent", "node-classify-intent.js"],
  ["Build Answer", "node-build-answer.js"],
  ["Build Unavailable Result", "node-build-unavailable.js"]
]) {
  check(node, nodeOf("chat-core.json", node).parameters.jsCode === read(`${SRC}/${source}`));
}

console.log("\n=== every emitted answerKey has a label in every language ===");
const builder = read(`${SRC}/node-build-answer.js`);
const keys = new Set();
for (const m of builder.matchAll(/answer\(\s*\n?\s*"([A-Za-z0-9_]+)"/g)) keys.add(m[1]);
for (const m of builder.matchAll(/\?\s*"([A-Za-z0-9_]+)"\s*:\s*"([A-Za-z0-9_]+)"/g)) {
  keys.add(m[1]);
  keys.add(m[2]);
}
check("builder emits answer keys", keys.size > 0, `${keys.size} keys`);

const bundles = Object.fromEntries(
  LANGS.map((l) => [l, JSON.parse(read(`apps/web/public/locales/${l}/common.json`))])
);
for (const key of [...keys].sort()) {
  for (const lang of LANGS) {
    check(`${lang}/${key}`, typeof bundles[lang].chat.answer[key] === "string");
  }
}

console.log("\n=== the answer builder stays within its contract ===");
// Checked against code with comments removed: the comments in that file
// document these very rules ("never eligibility"), so scanning them
// would flag the documentation as a violation.
// The `[^:]` guard leaves `https://` alone while still removing trailing
// `//` comments, which is where the rule documentation actually sits.
const builderCode = builder
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "")
  .replace(/([^:])\/\/.*$/gm, "$1");
check("no LLM or model node referenced", !/openai|anthropic|langchain|lmChat|chatModel|completion/i.test(builderCode));
check(
  "no route to Crop Diagnosis anywhere in the workflow",
  !/crop-?diagnosis/i.test(read(`${WF}/chat-core.json`))
);
// Reporting a soil reading is allowed; comparing one to a threshold is
// how a report turns into a recommendation, so the builder must not.
check(
  "no soil value is compared to a threshold",
  !/(ph|nitrogen|phosphorus|potassium|organicCarbon)\s*[<>]/i.test(builder)
);
check("scheme answers never claim eligibility", !/eligib/i.test(builderCode));

console.log("\n=== no chat template prescribes a treatment ===");
// Soil PARAMETER NAMES are legitimate: soil.status reports what the
// farmer recorded, using the same labels the Soil & Water page uses.
// Products, doses and instructions are not.
const BANNED_EN = [
  "spray", "dosage", "pesticide", "fungicide", "insecticide", "herbicide",
  "kg/ha", "ml/l", "g/l", "per hectare", "you should apply", "we recommend"
];
const BANNED_PRODUCTS = [
  "urea", "dap", "mancozeb", "carbendazim", "imidacloprid", "glyphosate", "chlorpyrifos"
];
for (const [key, value] of Object.entries(bundles.en.chat.answer)) {
  const lower = String(value).toLowerCase();
  const hit = BANNED_EN.find((w) => lower.includes(w));
  check(`en/${key} is not instructional`, !hit, hit ? `contains "${hit}"` : "");
}
for (const lang of LANGS) {
  for (const [key, value] of Object.entries(bundles[lang].chat.answer)) {
    const lower = String(value).toLowerCase();
    const hit = BANNED_PRODUCTS.find((w) => lower.includes(w));
    check(`${lang}/${key} names no product`, !hit, hit ? `contains "${hit}"` : "");
    check(
      `${lang}/${key} claims no eligibility`,
      !/you are eligible|you qualify/i.test(String(value))
    );
  }
}

console.log(`\n${failures === 0 ? "ALL CHAT CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
