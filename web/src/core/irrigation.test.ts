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

test("RAW = p(crop) x TAW(soil) x root depth(crop)", () => {
  const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
  near(readilyAvailableWater("wheat", "loam"), 85.25);  // 0.55 * 155 * 1.0
  near(readilyAvailableWater("onion", "sandy"), 7.2);   // 0.30 * 80 * 0.3
  near(readilyAvailableWater("potato", "clay"), 22.4);  // 0.35 * 160 * 0.4
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
  assert.equal(r.daysUntil, Math.ceil((88 - 4.6) / 4.6)); // RAW = 0.55 * 160 * 1.0
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


// ---- FAO-56: the app's numbers must follow the published rows (fixture copied from fao.org) ----
import fao from "./data/fao56_rows.json" with { type: "json" };
import { CROPS, SOILS } from "./irrigation.ts";

const nums = (v: string) => v.split("-").map(Number);
const higher = (v: string) => Math.max(...nums(v));   // the app's rule for a printed range of Kc
const lower = (v: string) => Math.min(...nums(v));    // the app's rule for a printed range of root depth
const mid = (v: string) => { const [a, b] = nums(v); return (a + b) / 2; };

test("every crop's Kc, root depth and p come from its named FAO-56 rows", () => {
  for (const [id, c] of Object.entries(CROPS)) {
    const t12 = (fao.table12 as Record<string, { ini: string; mid: string; end: string }>)[c.fao];
    const t22 = (fao.table22 as Record<string, { root_m: string; p: string }>)[c.fao];
    assert.ok(t12 && t22, `${id}: rows "${c.fao}" exist`);
    assert.deepEqual(c.kc, { initial: higher(t12.ini), mid: higher(t12.mid), late: higher(t12.end) }, `${id} Kc`);
    assert.equal(c.rootM, lower(t22.root_m), `${id} root depth`);
    assert.equal(c.p, Number(t22.p), `${id} p`);
  }
});

test("published depletion fractions for the stress-sensitive crops (Table 22)", () => {
  assert.equal(CROPS.onion.p, 0.30);
  assert.equal(CROPS.potato.p, 0.35);
  assert.equal(CROPS.tomato.p, 0.40);
  assert.equal(CROPS.cotton.p, 0.65);
  assert.equal(CROPS.wheat.p, 0.55);
});

test("TAW per soil is the midpoint of the Table 19 range, in mm per metre", () => {
  const map: Record<string, string> = { sandy: "Sand", loam: "Loam", clay: "Clay" };
  for (const [id, s] of Object.entries(SOILS)) {
    assert.equal(s.tawMmPerM, Math.round(1000 * mid((fao.table19_fc_minus_wp_m3_per_m3 as Record<string, string>)[map[id]])), id);
  }
});

test("worked example: wheat on loam, mid season, 7 dry days at ET0 5 mm", () => {
  // ETc = 1.15 * 5 = 5.75 mm/day; 7 days -> 40.25 mm used. RAW = 0.55 * 155 * 1.0 = 85.25 mm.
  // Not yet: (85.25 - 40.25) / 5.75 = 7.8 -> 8 days to go.
  const d = Array.from({ length: 11 }, (_, i) => ({ date: `2026-10-${String(1 + i).padStart(2, "0")}`, et0: 5, rain: 0 }));
  const r = advise({ crop: "wheat", soil: "loam", stage: "mid", areaAcres: 1, lastWatered: "2026-10-01", today: "2026-10-08", days: d });
  assert.equal(r.depletionMm, 40.3);
  assert.equal(r.rawMm, 85.3);
  assert.equal(r.action, "no_need");
  assert.equal(r.daysUntil, 8);
});

test("daily use is averaged over the next 3 forecast days; only the next 2 days' rain can delay watering", () => {
  const past = Array.from({ length: 5 }, (_, i) => ({ date: `2026-10-0${1 + i}`, et0: 5, rain: 0 }));
  const future = [{ date: "2026-10-06", et0: 2, rain: 0 }, { date: "2026-10-07", et0: 2, rain: 0 }, { date: "2026-10-08", et0: 8, rain: 60 }, { date: "2026-10-09", et0: 20, rain: 0 }];
  const r = advise({ crop: "onion", soil: "sandy", stage: "mid", areaAcres: 1, lastWatered: "2026-10-01", today: "2026-10-05", days: [...past, ...future] });
  assert.equal(r.dailyUseMm, 4.2);    // 1.05 * (2 + 2 + 8) / 3
  assert.equal(r.rainNext2Mm, 0);     // day-3 rain is not counted
  assert.equal(r.action, "irrigate_now");
});
