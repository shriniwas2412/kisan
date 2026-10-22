import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FARM_CROPS, OBSERVED_COMMODITIES, commodityHi, cropName, heroFor, rangeBar, rainWords, dayLabel, shortDate, adviceLine, wateredChoices, LEAF_LABEL_HI, seasonHi } from "./farmView.ts";
import { LABELS } from "./leafCrops.ts";
import type { MandiRow } from "./mandi.ts";

const row = (o: Partial<MandiRow>): MandiRow => ({ state: "Madhya Pradesh", district: "Bhopal", market: "Test Mandi A", commodity: "Onion", variety: "", grade: "",
  arrival_date: "2026-10-20", min_price: 800, max_price: 4500, modal_price: 4300, ...o });

test("crop -> Agmarknet names use only strings actually seen from the API", () => {
  const snap = JSON.parse(readFileSync(new URL("../../public/demo/mandi-snapshot-2026-10-20.json", import.meta.url), "utf8"));
  for (const r of snap.records) assert.ok(OBSERVED_COMMODITIES.has(r.commodity), r.commodity);
  for (const c of FARM_CROPS) for (const name of c.commodities) assert.ok(OBSERVED_COMMODITIES.has(name), `${c.id}: ${name}`);
  assert.deepEqual(FARM_CROPS.find(c => c.id === "chickpea")!.commodities, [], "no gram string seen yet, so none guessed");
});

test("hero shows the farmer's crop or says it's missing; never another crop", () => {
  const rows = [row({}), row({ commodity: "Wheat", modal_price: 2625, min_price: 2625, max_price: 2625, arrival_date: "2026-10-19" })];
  assert.equal(heroFor(rows, ["wheat"]).row?.commodity, "Wheat");
  assert.equal(heroFor(rows, ["soybean", "onion"]).row?.commodity, "Onion");
  const none = heroFor([row({})], ["wheat"]);
  assert.equal(none.row, null);
  assert.equal(none.crop, "wheat");
  assert.equal(heroFor([row({})], []).row, null, "no crop picked: no price shown as if it were theirs");
});

test("range bar comes from the same row; no bar without min and max", () => {
  assert.deepEqual(rangeBar(row({ min_price: 1000, modal_price: 1500, max_price: 2000 })), { min: 1000, modal: 1500, max: 2000, modalPct: 50 });
  assert.equal(rangeBar(row({ min_price: null })), null);
  assert.equal(rangeBar(row({ min_price: 2625, max_price: 2625, modal_price: 2625 })), null);
  assert.equal(rangeBar(row({ min_price: 1000, max_price: 2000, modal_price: 2500 }))!.modalPct, 100);
});

test("Hindi names for commodities, crops, seasons and all 28 leaf labels; unknown strings stay as written", () => {
  assert.equal(commodityHi("Onion"), "प्याज़");
  assert.equal(commodityHi("Paddy(Common)"), "धान");
  assert.equal(commodityHi("Something New"), "Something New");
  assert.equal(cropName("chickpea", "hi"), "चना");
  assert.equal(cropName("unknown-crop", "hi"), "unknown-crop");
  assert.equal(seasonHi("rabi"), "रबी");
  for (const l of LABELS) assert.ok(LEAF_LABEL_HI[l], `missing Hindi for ${l}`);
});

test("rain in words follows IMD's 24-hour categories", () => {
  assert.equal(rainWords(0), "none");
  assert.equal(rainWords(0.05), "veryLight");
  assert.equal(rainWords(2.4), "veryLight");
  assert.equal(rainWords(2.5), "light");
  assert.equal(rainWords(15.5), "light");
  assert.equal(rainWords(15.6), "moderate");
  assert.equal(rainWords(64.5), "heavy");
  assert.equal(rainWords(115.6), "veryHeavy");
  assert.equal(rainWords(204.5), "extreme");
});

test("day labels and short dates in Hindi and English", () => {
  assert.equal(dayLabel("2026-10-22", "2026-10-22", "hi"), "आज");
  assert.equal(dayLabel("2026-10-23", "2026-10-22", "en"), "Tomorrow");
  assert.match(dayLabel("2026-10-24", "2026-10-22", "en"), /Sat.*24.*Oct/);
  assert.match(shortDate("2026-10-20", "hi"), /20 अक्टू/);
  assert.match(shortDate("2026-10-20", "en"), /20 Oct/);
  assert.equal(shortDate(null, "en"), "");
});

test("one plain advice line per action, with days when known", () => {
  assert.deepEqual(adviceLine({ action: "no_need", daysUntil: 9 }), { icon: "check", key: "do_no_need", days: 9 });
  assert.deepEqual(adviceLine({ action: "irrigate_now", daysUntil: null }), { icon: "drop", key: "do_irrigate_now", days: null });
  assert.equal(adviceLine({ action: "wait_rain", daysUntil: null }).icon, "rain");
});

test("'last watered' choices map to dates; 'earlier' asks for a date", () => {
  assert.deepEqual(wateredChoices("2026-10-22"), [
    { key: "w_today", date: "2026-10-22" }, { key: "w_yesterday", date: "2026-10-21" },
    { key: "w_2_3", date: "2026-10-19" }, { key: "w_week", date: "2026-10-15" }, { key: "w_earlier", date: null }]);
});

test("every state in the app has a Hindi name for pickers", async () => {
  const { STATES, stateName } = await import("./places.ts");
  for (const s of STATES) assert.notEqual(stateName(s, "hi"), s, s);
  assert.equal(stateName("Madhya Pradesh", "hi"), "मध्य प्रदेश");
  assert.equal(stateName("Madhya Pradesh", "en"), "Madhya Pradesh");
});
