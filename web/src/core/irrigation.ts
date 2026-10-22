// Irrigation advice from a simple FAO-56 soil-water balance.
// ETc = Kc x ET0. Water used since the last watering is compared with the
// readily available water (RAW) the root zone holds for this soil.
// All pure functions so they can be tested without a browser.

// Crop values from FAO-56, by named row (data/fao56_rows.json holds the printed rows;
// irrigation.test.ts checks every number below against them):
//   kc     Table 12 Kc ini / mid / end. Where a range is printed, the higher value.
//   rootM  Table 22 maximum root depth. Where a range is printed, the lower value
//          (a shallower root zone holds less water, so advice errs towards watering).
//   p      Table 22 depletion fraction for no stress (for ETc about 5 mm/day; not adjusted).
// Wheat uses the "Spring Wheat" rows for both tables.
export type Stage = "initial" | "mid" | "late";
export type IrrCrop = { en: string; hi: string; fao: string; kc: Record<Stage, number>; rootM: number; p: number; flooded?: boolean };
export const CROPS: Record<string, IrrCrop> = {
  wheat:     { en: "Wheat",     hi: "गेहूं",    fao: "Spring Wheat", kc: { initial: 0.3, mid: 1.15, late: 0.4 }, rootM: 1.0, p: 0.55 },
  soybean:   { en: "Soybean",   hi: "सोयाबीन", fao: "Soybeans", kc: { initial: 0.4, mid: 1.15, late: 0.5 }, rootM: 0.6, p: 0.5 },
  cotton:    { en: "Cotton",    hi: "कपास",    fao: "Cotton", kc: { initial: 0.35, mid: 1.2, late: 0.7 }, rootM: 1.0, p: 0.65 },
  maize:     { en: "Maize",     hi: "मक्का",    fao: "Maize, Field (grain) (field corn)", kc: { initial: 0.3, mid: 1.2, late: 0.6 }, rootM: 1.0, p: 0.55 },
  chickpea:  { en: "Chickpea",  hi: "चना",     fao: "Chick pea", kc: { initial: 0.4, mid: 1.0, late: 0.35 }, rootM: 0.6, p: 0.5 },
  tomato:    { en: "Tomato",    hi: "टमाटर",   fao: "Tomato", kc: { initial: 0.6, mid: 1.15, late: 0.9 }, rootM: 0.7, p: 0.4 },
  potato:    { en: "Potato",    hi: "आलू",     fao: "Potato", kc: { initial: 0.5, mid: 1.15, late: 0.75 }, rootM: 0.4, p: 0.35 },
  onion:     { en: "Onion",     hi: "प्याज़",    fao: "Onions - dry", kc: { initial: 0.7, mid: 1.05, late: 0.75 }, rootM: 0.3, p: 0.3 },
  sugarcane: { en: "Sugarcane", hi: "गन्ना",    fao: "Sugar Cane", kc: { initial: 0.4, mid: 1.25, late: 0.75 }, rootM: 1.2, p: 0.65 },
  rice:      { en: "Rice (paddy)", hi: "धान", fao: "Rice", kc: { initial: 1.05, mid: 1.2, late: 0.9 }, rootM: 0.5, p: 0.2, flooded: true },
};

// Total available water, mm per metre of root depth: the midpoint of the FAO-56
// Table 19 range of (field capacity - wilting point) for that soil texture.
export const SOILS: Record<string, { en: string; hi: string; tawMmPerM: number }> = {
  sandy: { en: "Sandy (light)", hi: "रेतीली (हल्की)", tawMmPerM: 80 },   // Sand 0.05-0.11
  loam:  { en: "Loam (medium)", hi: "दोमट (मध्यम)", tawMmPerM: 155 },    // Loam 0.13-0.18
  clay:  { en: "Clay / black cotton soil", hi: "काली / चिकनी मिट्टी", tawMmPerM: 160 }, // Clay 0.12-0.20
};

export const SQ_M_PER_ACRE = 4046.86;

/**
 * Rain counted as reaching the root zone: 0.8 x P when P > 2 mm, otherwise 0.
 * This is the app's own rule of thumb (light showers mostly evaporate); it is NOT from FAO-56.
 */
export function effectiveRain(mm: number): number {
  if (!Number.isFinite(mm) || mm <= 2) return 0;
  return 0.8 * mm;
}

/** Readily available water in the root zone, mm. */
export function readilyAvailableWater(crop: string, soil: string): number {
  const c = CROPS[crop], s = SOILS[soil];
  if (!c || !s) throw new Error(`unknown crop or soil: ${crop}, ${soil}`);
  return c.p * s.tawMmPerM * c.rootM;
}

/**
 * days: [{date, et0, rain}] in date order, ending today or later.
 * Returns the advice and the numbers it is based on.
 */
export type Day = { date: string; et0: number; rain: number; tmax?: number };
export type Action = "paddy" | "wait_rain" | "irrigate_now" | "irrigate_tomorrow" | "no_need";
export type AdviseInput = { crop: string; soil: string; stage: Stage; areaAcres: number | string; lastWatered: string; today: string; days: Day[] };

export function advise({ crop, soil, stage, areaAcres, lastWatered, today, days }: AdviseInput) {
  const c = CROPS[crop];
  if (!c) throw new Error(`unknown crop: ${crop}`);
  const kc = c.kc[stage] ?? c.kc.mid;
  const raw = readilyAvailableWater(crop, soil);

  const past = days.filter(d => d.date > lastWatered && d.date <= today);
  const future = days.filter(d => d.date > today).slice(0, 3);

  let depletion = 0;
  for (const d of past) {
    depletion = Math.max(0, depletion + kc * d.et0 - effectiveRain(d.rain));
  }
  const rainNext2 = future.slice(0, 2).reduce((s, d) => s + effectiveRain(d.rain), 0);
  const dailyUse = future.length
    ? future.reduce((s, d) => s + kc * d.et0, 0) / future.length
    : (past.length ? past.reduce((s, d) => s + kc * d.et0, 0) / past.length : 0);

  const areaM2 = (Number(areaAcres) || 0) * SQ_M_PER_ACRE;
  const litres = (mm: number) => Math.round(mm * areaM2); // 1 mm on 1 m² = 1 litre

  let action: Action, waterMm = 0, daysUntil: number | null = null;
  if (c.flooded) {
    action = "paddy";
  } else if (depletion >= raw && rainNext2 >= depletion) {
    action = "wait_rain";
  } else if (depletion >= raw) {
    action = "irrigate_now";
    waterMm = depletion;
  } else {
    daysUntil = dailyUse > 0 ? Math.ceil((raw - depletion) / dailyUse) : null;
    action = daysUntil !== null && daysUntil <= 1 ? "irrigate_tomorrow" : "no_need";
    if (action === "irrigate_tomorrow") waterMm = raw;
  }

  return {
    action,
    kc,
    rawMm: round1(raw),
    depletionMm: round1(depletion),
    dailyUseMm: round1(dailyUse),
    rainNext2Mm: round1(rainNext2),
    daysUntil,
    waterMm: round1(waterMm),
    waterLitres: litres(waterMm),
    daysCounted: past.length,
  };
}

function round1(x: number) { return Math.round(x * 10) / 10; }

/** Turn an Open-Meteo daily response into [{date, et0, rain}]. */
export function parseOpenMeteo(json: unknown): Day[] {
  const d = (json as { daily?: { time?: string[]; et0_fao_evapotranspiration: (number | null)[]; precipitation_sum: (number | null)[]; temperature_2m_max?: (number | null)[] } })?.daily;
  if (!d?.time) throw new Error("weather response has no daily data");
  return d.time.map((date: string, i: number) => ({
    date,
    et0: d.et0_fao_evapotranspiration[i] ?? 0,
    rain: d.precipitation_sum[i] ?? 0,
    tmax: d.temperature_2m_max?.[i] ?? undefined,
  }));
}

export function openMeteoUrl(lat: number, lon: number): string {
  const q = new URLSearchParams({
    latitude: String(lat), longitude: String(lon),
    daily: "et0_fao_evapotranspiration,precipitation_sum,temperature_2m_max",
    past_days: "14", forecast_days: "4", timezone: "Asia/Kolkata",
  });
  return `https://api.open-meteo.com/v1/forecast?${q}`;
}
