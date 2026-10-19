import { test } from "node:test";
import assert from "node:assert/strict";
import { calendarFor, isSourced, isOfficial, SCHEMES, CALENDAR, type CalendarEntry } from "./info.ts";

const entry = (over: Partial<CalendarEntry>): CalendarEntry => ({
  crop: "test", en: "Test", hi: "टेस्ट", season: "rabi", region: { en: "", hi: "" }, states: [], windows: [], ...over,
});

test("unsourced calendar entries are never shown", () => {
  const list = [entry({ crop: "a" }), entry({ crop: "b", source: "https://example.gov.in/x", last_verified: "2026-10-20" }),
    entry({ crop: "c", source: "http://insecure", last_verified: "2026-10-20" })];
  assert.deepEqual(calendarFor({}, list).map(e => e.crop), ["b"]);
});

test("every shipped calendar entry has a source and a date", () => {
  assert.ok(CALENDAR.length >= 1);
  for (const e of CALENDAR) assert.ok(isSourced(e), e.crop);
});

test("calendar filters by crop and state; entries without a state list stay general", () => {
  const wheat = calendarFor({ crops: ["wheat"], state: "Madhya Pradesh" });
  assert.deepEqual(wheat.map(e => e.crop), ["wheat"]);
  assert.deepEqual(calendarFor({ crops: ["wheat"], state: "Uttar Pradesh" }), []);
  assert.deepEqual(calendarFor({ crops: ["soybean"], state: "Uttar Pradesh" }).map(e => e.crop), ["soybean"]);
});

test("the five scheme cards link to official government sites with a verified date", () => {
  assert.deepEqual(SCHEMES.map(s => s.id), ["pm-kisan", "pmfby", "shc", "kcc", "pm-kusum"]);
  for (const s of SCHEMES) { assert.ok(isOfficial(s.url), s.url); assert.match(s.last_verified, /^\d{4}-\d{2}-\d{2}$/); }
  assert.equal(isOfficial("https://pmkisankusumyojana.co.in/"), false);
});
