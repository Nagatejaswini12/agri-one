// Turns the per-URL check results into one report.
//
// This workflow REPORTS ONLY. It never rewrites the catalog: a scheme's
// wording, benefit or eligibility is something a person has to read off
// the official page and vouch for. An automated rewrite would silently
// replace a verified fact with a scraped guess, which is precisely what
// the curated-catalog design exists to prevent.
//
// WHY THE FOUR-WAY SPLIT INSTEAD OF "dead or alive":
// several of these hosts (dac.gov.in, tn.gov.in, karnataka.gov.in) answer
// a browser fine but refuse or drop n8n Cloud's request — 403, a TLS
// reset, or a silent timeout. The first run of this workflow reported 7
// of 10 entries "dead" while every one of them returned 200 from a normal
// client minutes earlier. Reporting those as dead would train whoever
// reads this to ignore it, so a refusal and a real 404 are kept apart:
//
//   reachable   2xx/3xx                 the page is there
//   blocked     401/403/405/429         the server answered and refused us;
//                                       the page exists, we just can't fetch it
//   missing     404/410                 genuinely gone — a person must look
//   unreachable no response at all      could not be checked from n8n
//
// Only "missing" and staleness are treated as action for a human. The
// other two are reported so the picture stays honest, not as alarms.

const STALENESS_DAYS = 180;

const results = $input.all().map((i) => i.json);

const reachable = [];
const blocked = [];
const missing = [];
const unreachable = [];

for (const r of results) {
  const status = typeof r.httpStatus === "number" ? r.httpStatus : null;
  const entry = {
    id: r.id,
    name: r.name,
    sourceUrl: r.sourceUrl,
    httpStatus: status,
    error: r.error || null
  };
  if (status === null) unreachable.push(entry);
  else if (status >= 200 && status < 400) reachable.push(entry);
  else if (status === 404 || status === 410) missing.push(entry);
  else if (status === 401 || status === 403 || status === 405 || status === 429) blocked.push(entry);
  else missing.push(entry);
}

const daysSince = (iso) => {
  if (typeof iso !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const then = Date.parse(iso + "T00:00:00Z");
  if (Number.isNaN(then)) return null;
  return Math.floor((Date.now() - then) / 86400000);
};

const stale = [];
for (const r of results) {
  const age = daysSince(r.lastVerifiedOn);
  if (age === null || age > STALENESS_DAYS) {
    stale.push({
      id: r.id,
      name: r.name,
      lastVerifiedOn: r.lastVerifiedOn || null,
      ageDays: age
    });
  }
}

const needsPerson = missing.length > 0 || stale.length > 0;

const report = {
  checkedAt: new Date().toISOString(),
  totalEntries: results.length,
  reachableCount: reachable.length,
  blockedCount: blocked.length,
  missingCount: missing.length,
  unreachableCount: unreachable.length,
  staleCount: stale.length,
  missingLinks: missing,
  blockedLinks: blocked,
  unreachableLinks: unreachable,
  staleEntries: stale,
  action: needsPerson
    ? "A person must re-read the affected official pages, update the catalog in Schemes - Core, bump lastVerifiedOn, and re-export services/n8n/workflows/schemes-core.json. Do not automate this."
    : "No action needed. Blocked or unreachable entries mean n8n could not fetch the page, not that the scheme is gone — open them in a browser if you want to confirm."
};

console.log("Scheme catalog check:", JSON.stringify(report));

return [{ json: report }];
