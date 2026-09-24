import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { OFFICIAL_CHANNELS, channelsForState } from "./officialChannels.ts";

/**
 * The official-channel list mirrors the curated scheme catalog, which is
 * the source of truth. These tests read that catalog and assert the two
 * cannot drift — a link shown to a farmer as "verified" must be the same
 * link a person actually verified, with the same date.
 */

const CATALOG_SRC = "../../services/n8n/workflows/src/schemes/catalog-literal.js";

interface CatalogEntry {
  id: string;
  name: string;
  states: string[];
  sourceName: string;
  sourceUrl: string;
  lastVerifiedOn: string;
}

const catalog = new Function(
  `${fs.readFileSync(CATALOG_SRC, "utf8")}; return CATALOG;`
)() as CatalogEntry[];

test("every official channel exists in the curated catalog, unchanged", () => {
  assert.ok(OFFICIAL_CHANNELS.length > 0);
  for (const channel of OFFICIAL_CHANNELS) {
    const entry = catalog.find((e) => e.id === channel.catalogId);
    assert.ok(entry, `${channel.catalogId} is not in the scheme catalog`);
    assert.equal(channel.sourceUrl, entry.sourceUrl, `${channel.catalogId} url drifted`);
    assert.equal(channel.sourceName, entry.sourceName, `${channel.catalogId} source name drifted`);
    assert.equal(
      channel.lastVerifiedOn,
      entry.lastVerifiedOn,
      `${channel.catalogId} verified date drifted`
    );
    assert.ok(
      entry.states.includes(channel.state),
      `${channel.catalogId} does not apply to ${channel.state}`
    );
  }
});

test("every channel link is an official https URL", () => {
  for (const channel of OFFICIAL_CHANNELS) {
    assert.match(channel.sourceUrl, /^https:\/\//, `${channel.catalogId} is not https`);
    assert.match(
      channel.sourceUrl,
      /\.gov\.in(\/|$)/,
      `${channel.catalogId} is not a .gov.in address`
    );
  }
});

test("a state with no verified channel gets nothing, not a placeholder", () => {
  // The whole point: silence beats pointing a farmer somewhere that may
  // not serve their state.
  for (const state of ["Kerala", "Bihar", "Punjab", "Assam"]) {
    assert.deepEqual(channelsForState(state), []);
  }
});

test("matching is case-insensitive on the resolved state name", () => {
  assert.equal(channelsForState("Tamil Nadu").length, 1);
  assert.equal(channelsForState("tamil nadu").length, 1);
  assert.equal(channelsForState("  TAMIL NADU  ").length, 1);
});

test("a missing or empty state yields no channels", () => {
  for (const value of [null, undefined, "", "   "]) {
    assert.deepEqual(channelsForState(value), []);
  }
});

test("no channel carries buyer or contact data", () => {
  const serialized = JSON.stringify(OFFICIAL_CHANNELS);
  assert.ok(!/phone|mobile|contact|email|@|\+91/i.test(serialized));
  for (const channel of OFFICIAL_CHANNELS) {
    assert.deepEqual(Object.keys(channel).sort(), [
      "catalogId",
      "lastVerifiedOn",
      "name",
      "sourceName",
      "sourceUrl",
      "state"
    ]);
  }
});
