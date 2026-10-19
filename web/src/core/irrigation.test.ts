import { test } from "node:test";
import assert from "node:assert/strict";
import { advise, effectiveRain, readilyAvailableWater, parseOpenMeteo, openMeteoUrl, SQ_M_PER_ACRE } from "./irrigation.ts";

const days = (n: number, et0: number, rain = 0, start = 1) =>
  Array.from({ length: n }, (_, i) => ({ date: `2026-10-${String(start + i).padStart(2, "0")}`, et0, rain }));

test("light rain is ignored, heavier rain counts at 80%", () => {
  assert.equal(effectiveRain(2), 0);
  assert.equal(effectiveRain(10), 8);
  assert.equal(effectiveRain(NaN), 0);
});

test("RAW = 0.5 x TAW x root depth", () => {
  assert.equal(readilyAvailableWater("wheat", "loam"), 70);   // 0.5 * 140 * 1.0
  assert.equal(readilyAvailableWater("onion", "sandy"), 14);  // 0.5 * 70 * 0.4
  assert.throws(() => readilyAvailableWater("wheat", "rock"));
});

test("dry week on sandy soil -> irrigate now, with litres for the area", () => {
  // onion mid-season: Kc 1.05, ET0 5 -> 5.25 mm/day; RAW 14 mm; 4 days -> 21 mm used
  const r = advise({ crop: "onion", soil: "sandy", stage: "mid", areaAcres: 1, lastWatered: "2026-10-01",
    today: "2026-10-05", days: days(8, 5) });
  assert.equal(r.action, "irrigate_now");
  assert.equal(r.depletionMm, 21);
  assert.equal(r.waterLitres, Math.round(21 * SQ_M_PER_ACRE));
});

test("dry soil but big rain in the next two days -> wait", () => {
  const d = days(5, 5).concat([{ date: "2026-10-06", et0: 2, rain: 40 }, { date: "2026-10-07", et0: 2, rain: 5 }]);
  const r = advise({ crop: "onion", soil: "sandy", stage: "mid", areaAcres: 1, lastWatered: "2026-10-01", today: "2026-10-05", days: d });
  assert.equal(r.action, "wait_rain");
});

test("recently watered clay soil -> no need, with days until next watering", () => {
  const r = advise({ crop: "wheat", soil: "clay", stage: "mid", areaAcres: 2, lastWatered: "2026-10-04",
    today: "2026-10-05", days: days(8, 4) });
  assert.equal(r.action, "no_need");
  assert.equal(r.depletionMm, 4.6);  // 1 day x 1.15 x 4
  assert.equal(r.daysUntil, Math.ceil((90 - 4.6) / 4.6));
  assert.equal(r.waterLitres, 0);
});

test("rain since watering refills the soil, never below zero use", () => {
  const d = [{ date: "2026-10-02", et0: 4, rain: 50 }, ...days(3, 4, 0, 3)];
  const r = advise({ crop: "wheat", soil: "loam", stage: "mid", areaAcres: 1, lastWatered: "2026-10-01", today: "2026-10-05", days: d });
  assert.equal(r.depletionMm, 13.8); // day 2 resets to 0, then 3 x 4.6
});

test("paddy gets the standing-water message", () => {
  assert.equal(advise({ crop: "rice", soil: "clay", stage: "mid", areaAcres: 1, lastWatered: "2026-10-01",
    today: "2026-10-05", days: days(8, 5) }).action, "paddy");
});

test("Open-Meteo parsing and URL", () => {
  const parsed = parseOpenMeteo({ daily: { time: ["2026-10-01"], et0_fao_evapotranspiration: [4.2], precipitation_sum: [null] } });
  assert.deepEqual(parsed, [{ date: "2026-10-01", et0: 4.2, rain: 0, tmax: undefined }]);
  assert.throws(() => parseOpenMeteo({}));
  assert.match(openMeteoUrl(23.26, 77.41), /past_days=14.*timezone=Asia%2FKolkata/);
});

// FAO-56 reference values the tables are taken from (Allen et al. 1998, Table 12 Kc, Table 19 TAW).
test("FAO-56 Kc mid-season values used for the main target crops", async () => {
  const { CROPS, SOILS } = await import("./irrigation.ts");
  assert.equal(CROPS.wheat.kc.mid, 1.15);
  assert.equal(CROPS.maize.kc.mid, 1.2);
  assert.equal(CROPS.cotton.kc.mid, 1.15);
  assert.equal(CROPS.soybean.kc.mid, 1.15);
  assert.equal(SOILS.loam.tawMmPerM, 140);
});
