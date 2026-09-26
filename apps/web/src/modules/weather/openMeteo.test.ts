import { test } from "node:test";
import assert from "node:assert/strict";
import { mapOpenMeteo, openMeteoQuery, parseCoordinates } from "./openMeteo.ts";

/**
 * These pin the mapping that moved out of the n8n workflow.
 *
 * The point of the migration was that a farmer sees the same thing from
 * a different caller, so the thresholds are asserted at their exact
 * boundaries rather than loosely — a threshold that silently drifted by
 * one degree would still "work" and still be wrong.
 */

const FIXED = () => new Date("2026-09-27T00:00:00.000Z");

/** Shaped exactly like a real Open-Meteo forecast response. */
function response(over: Record<string, unknown> = {}) {
  return {
    latitude: 11.0,
    longitude: 77.0,
    timezone: "Asia/Kolkata",
    current: {
      time: "2026-09-27T05:30",
      temperature_2m: 25.4,
      relative_humidity_2m: 80,
      precipitation: 0,
      weather_code: 1,
      wind_speed_10m: 15
    },
    daily: {
      time: ["2026-09-27", "2026-09-28", "2026-09-29"],
      weather_code: [51, 51, 51],
      temperature_2m_max: [32.2, 33.7, 34.5],
      temperature_2m_min: [22.6, 22.4, 22.8],
      precipitation_sum: [0.3, 0.6, 0.4],
      precipitation_probability_max: [8, 61, 61]
    },
    ...over
  };
}

test("maps a real response into the WeatherSnapshot contract", () => {
  const r = mapOpenMeteo(response(), FIXED);
  assert.equal(r.status, "ok");
  if (r.status !== "ok") return;
  assert.equal(r.source, "open-meteo");
  assert.equal(r.asOf, "2026-09-27T00:00:00.000Z");
  assert.equal(r.data.timezone, "Asia/Kolkata");
  assert.equal(r.data.current.temperatureC, 25.4);
  assert.equal(r.data.current.windSpeedKph, 15);
  assert.equal(r.data.forecast.length, 3);
  assert.equal(r.data.forecast[0].date, "2026-09-27");
  assert.equal(r.data.forecast[2].temperatureMaxC, 34.5);
});

test("readings are passed through exactly, never rounded or filled in", () => {
  const r = mapOpenMeteo(response(), FIXED);
  assert.equal(r.status, "ok");
  if (r.status !== "ok") return;
  assert.equal(r.data.current.temperatureC, 25.4);
  assert.equal(r.data.forecast[0].precipitationSumMm, 0.3);
});

test("a value the source omitted becomes null, not a substituted default", () => {
  const body = response();
  delete (body.current as Record<string, unknown>).temperature_2m;
  (body.daily as Record<string, unknown>).precipitation_sum = [null, 0.6, 0.4];
  const r = mapOpenMeteo(body, FIXED);
  assert.equal(r.status, "ok");
  if (r.status !== "ok") return;
  assert.equal(r.data.current.temperatureC, null);
  assert.equal(r.data.forecast[0].precipitationSumMm, null);
});

test("a 200 with no current reading and no days is unavailable, not an empty card", () => {
  const r = mapOpenMeteo({ latitude: 11, longitude: 77, current: {}, daily: {} }, FIXED);
  assert.equal(r.status, "unavailable");
});

test("an unreadable payload is unavailable rather than a crash", () => {
  assert.equal(mapOpenMeteo("nonsense", FIXED).status, "unavailable");
  assert.equal(mapOpenMeteo(null, FIXED).status, "unavailable");
});

test("a day without a date is dropped — it cannot be labelled or ordered", () => {
  const body = response();
  (body.daily as Record<string, unknown>).time = ["2026-09-27", null, "2026-09-29"];
  const r = mapOpenMeteo(body, FIXED);
  assert.equal(r.status, "ok");
  if (r.status !== "ok") return;
  assert.equal(r.data.forecast.length, 2);
});

// ------------------------------------------------ advisory thresholds

function advisories(over: Record<string, unknown>) {
  const r = mapOpenMeteo(response(over), FIXED);
  return r.status === "ok" ? r.data.advisories : null;
}

test("rain_expected_today fires at 60% and not at 59%", () => {
  const daily = (p: number) => ({
    daily: { ...response().daily, precipitation_probability_max: [p, 10, 10] }
  });
  assert.ok(advisories(daily(60))?.includes("rain_expected_today"));
  assert.ok(!advisories(daily(59))?.includes("rain_expected_today"));
});

test("heavy_rain_expected needs BOTH 70% probability and 10mm — either alone is not enough", () => {
  const d = (prob: number, sum: number) => ({
    daily: {
      ...response().daily,
      precipitation_probability_max: [prob, 10, 10],
      precipitation_sum: [sum, 0.1, 0.1]
    }
  });
  assert.ok(advisories(d(70, 10))?.includes("heavy_rain_expected"));
  assert.ok(!advisories(d(69, 10))?.includes("heavy_rain_expected"));
  assert.ok(!advisories(d(70, 9.9))?.includes("heavy_rain_expected"));
});

test("thunderstorm_expected fires on WMO 95/96/99, from current or any day", () => {
  assert.ok(advisories({ current: { ...response().current, weather_code: 95 } })?.includes("thunderstorm_expected"));
  assert.ok(
    advisories({ daily: { ...response().daily, weather_code: [51, 99, 51] } })?.includes("thunderstorm_expected")
  );
  assert.ok(!advisories({})?.includes("thunderstorm_expected"));
});

test("high_wind fires at 30 kph and not at 29.9", () => {
  assert.ok(advisories({ current: { ...response().current, wind_speed_10m: 30 } })?.includes("high_wind"));
  assert.ok(!advisories({ current: { ...response().current, wind_speed_10m: 29.9 } })?.includes("high_wind"));
});

test("extreme_heat fires at 40C and not at 39.9", () => {
  const max = (t: number) => ({ daily: { ...response().daily, temperature_2m_max: [t, 20, 20] } });
  assert.ok(advisories(max(40))?.includes("extreme_heat"));
  assert.ok(!advisories(max(39.9))?.includes("extreme_heat"));
});

test("no_rain_next_3_days needs every day to have actually reported a figure", () => {
  const dry = { daily: { ...response().daily, precipitation_sum: [0, 0, 0] } };
  assert.ok(advisories(dry)?.includes("no_rain_next_3_days"));

  // One unreported day must not be read as a dry day.
  const partial = { daily: { ...response().daily, precipitation_sum: [0, null, 0] } };
  assert.ok(!advisories(partial)?.includes("no_rain_next_3_days"));

  // Nor may a wet day.
  const wet = { daily: { ...response().daily, precipitation_sum: [0, 5, 0] } };
  assert.ok(!advisories(wet)?.includes("no_rain_next_3_days"));
});

test("only the advisories the forecast actually supports are emitted", () => {
  // The base fixture is a real Coimbatore response: three days all under
  // the 1mm dry threshold, so a dry spell is the correct and only call.
  assert.deepEqual(advisories({}), ["no_rain_next_3_days"]);

  // Genuinely unremarkable weather — some rain each day, mild, calm —
  // must produce nothing at all.
  assert.deepEqual(
    advisories({
      current: { ...response().current, wind_speed_10m: 5, weather_code: 1 },
      daily: {
        ...response().daily,
        temperature_2m_max: [30, 30, 30],
        precipitation_sum: [4, 4, 4],
        precipitation_probability_max: [40, 40, 40]
      }
    }),
    []
  );
});

// ------------------------------------------------------- the request

test("the query matches what the workflow sent", () => {
  const q = openMeteoQuery(11.0, 77.0);
  assert.equal(q.get("latitude"), "11");
  assert.equal(q.get("longitude"), "77");
  assert.equal(q.get("forecast_days"), "3");
  assert.equal(q.get("timezone"), "auto");
  assert.equal(q.get("current"), "temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m");
  assert.equal(
    q.get("daily"),
    "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max"
  );
});

test("coordinates are rejected rather than guessed", () => {
  assert.deepEqual(parseCoordinates(11, 77), { latitude: 11, longitude: 77 });
  assert.equal(parseCoordinates(null, 77), null);
  assert.equal(parseCoordinates(11, undefined), null);
  assert.equal(parseCoordinates("11", "77"), null);
  assert.equal(parseCoordinates(NaN, 77), null);
  assert.equal(parseCoordinates(91, 77), null, "latitude out of range");
  assert.equal(parseCoordinates(11, 181), null, "longitude out of range");
  assert.deepEqual(parseCoordinates(0, 0), { latitude: 0, longitude: 0 }, "0,0 is a real coordinate");
});
