// Irrigation advice from a simple FAO-56 soil-water balance.
// ETc = Kc x ET0. Water used since the last watering is compared with the
// readily available water (RAW) the root zone holds for this soil.
// All pure functions so they can be tested without a browser.

// Crop coefficients (FAO-56 Table 12, rounded) and typical root depth in metres.
export type Stage = "initial" | "mid" | "late";
export type IrrCrop = { en: string; hi: string; kc: Record<Stage, number>; rootM: number; flooded?: boolean };
export const CROPS: Record<string, IrrCrop> = {
  wheat:     { en: "Wheat",     hi: "गेहूं",    kc: { initial: 0.7, mid: 1.15, late: 0.4 }, rootM: 1.0 },
  soybean:   { en: "Soybean",   hi: "सोयाबीन", kc: { initial: 0.4, mid: 1.15, late: 0.5 }, rootM: 0.8 },
  cotton:    { en: "Cotton",    hi: "कपास",    kc: { initial: 0.35, mid: 1.15, late: 0.7 }, rootM: 1.2 },
  maize:     { en: "Maize",     hi: "मक्का",    kc: { initial: 0.3, mid: 1.2, late: 0.6 }, rootM: 1.0 },
  chickpea:  { en: "Chickpea",  hi: "चना",     kc: { initial: 0.4, mid: 1.0, late: 0.35 }, rootM: 0.8 },
  tomato:    { en: "Tomato",    hi: "टमाटर",   kc: { initial: 0.6, mid: 1.15, late: 0.8 }, rootM: 0.7 },
  potato:    { en: "Potato",    hi: "आलू",     kc: { initial: 0.5, mid: 1.15, late: 0.75 }, rootM: 0.5 },
  onion:     { en: "Onion",     hi: "प्याज",    kc: { initial: 0.7, mid: 1.05, late: 0.75 }, rootM: 0.4 },
  sugarcane: { en: "Sugarcane", hi: "गन्ना",    kc: { initial: 0.4, mid: 1.25, late: 0.75 }, rootM: 1.2 },
  rice:      { en: "Rice (paddy)", hi: "धान", kc: { initial: 1.05, mid: 1.2, late: 0.9 }, rootM: 0.3, flooded: true },
};

// Total available water, mm per metre of root depth (FAO-56 Table 19, mid-range).
export const SOILS: Record<string, { en: string; hi: string; tawMmPerM: number }> = {
  sandy: { en: "Sandy (light)", hi: "रेतीली (हल्की)", tawMmPerM: 70 },
  loam:  { en: "Loam (medium)", hi: "दोमट (मध्यम)", tawMmPerM: 140 },
  clay:  { en: "Clay / black cotton soil", hi: "काली / चिकनी मिट्टी", tawMmPerM: 180 },
};

const DEPLETION_FRACTION = 0.5; // FAO-56 p for most field crops
export const SQ_M_PER_ACRE = 4046.86;

/** Rain that actually reaches the root zone. Light showers mostly evaporate. */
export function effectiveRain(mm: number): number {
  if (!Number.isFinite(mm) || mm <= 2) return 0;
  return 0.8 * mm;
}

/** Readily available water in the root zone, mm. */
export function readilyAvailableWater(crop: string, soil: string): number {
  const c = CROPS[crop], s = SOILS[soil];
  if (!c || !s) throw new Error(`unknown crop or soil: ${crop}, ${soil}`);
  return DEPLETION_FRACTION * s.tawMmPerM * c.rootM;
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
