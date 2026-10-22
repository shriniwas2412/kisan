// What the farmer sees, in their words: their crop's price (from one real Agmarknet row),
// Hindi names, rain in words, "today / tomorrow", and one line of advice.

import type { MandiRow } from "./mandi.ts";
import type { Action } from "./irrigation.ts";

/**
 * Commodity names exactly as data.gov.in returned them, and where they were seen:
 * - the demo snapshot (web/public/demo/mandi-snapshot-2026-10-20.json);
 * - the live probe on 2026-10-19 (Madhya Pradesh / Bhopal: Onion, Wheat);
 * - names seen while verifying the API on 2026-10-19: Paddy(Common), Maize, Tomato.
 * A farm crop is linked only to names in this set; nothing is guessed.
 */
export const OBSERVED_COMMODITIES = new Set([
  "Apple", "Brinjal", "Cabbage", "Carrot", "Green Chilli", "Maize", "Onion", "Paddy(Common)", "Papaya", "Pomegranate", "Soyabean",
  "Wheat", "Tomato",
]);

export type FarmCrop = { id: string; en: string; hi: string; commodities: string[] };

/** Crops a farmer can pick. Ids match the irrigation table and the sowing calendar. */
export const FARM_CROPS: FarmCrop[] = [
  { id: "wheat", en: "Wheat", hi: "गेहूं", commodities: ["Wheat"] },
  { id: "soybean", en: "Soybean", hi: "सोयाबीन", commodities: ["Soyabean"] },
  { id: "chickpea", en: "Gram (chana)", hi: "चना", commodities: [] },
  { id: "rice", en: "Paddy", hi: "धान", commodities: ["Paddy(Common)"] },
  { id: "maize", en: "Maize", hi: "मक्का", commodities: ["Maize"] },
  { id: "cotton", en: "Cotton", hi: "कपास", commodities: [] },
  { id: "onion", en: "Onion", hi: "प्याज़", commodities: ["Onion"] },
  { id: "tomato", en: "Tomato", hi: "टमाटर", commodities: ["Tomato"] },
  { id: "potato", en: "Potato", hi: "आलू", commodities: [] },
  { id: "sugarcane", en: "Sugarcane", hi: "गन्ना", commodities: [] },
];

const COMMODITY_HI: Record<string, string> = {
  Apple: "सेब", Brinjal: "बैंगन", Cabbage: "पत्ता गोभी", Carrot: "गाजर", "Green Chilli": "हरी मिर्च", Maize: "मक्का",
  Onion: "प्याज़", "Paddy(Common)": "धान", Papaya: "पपीता", Pomegranate: "अनार", Soyabean: "सोयाबीन", Wheat: "गेहूं", Tomato: "टमाटर",
};

export const commodityHi = (name: string) => COMMODITY_HI[name] ?? name;

export function cropName(id: string, lang: "hi" | "en"): string {
  const c = FARM_CROPS.find(x => x.id === id);
  return c ? c[lang] : id;
}

const SEASON: Record<string, string> = { rabi: "रबी", kharif: "खरीफ", zaid: "ज़ायद", perennial: "बारहमासी" };
export const seasonHi = (s: string) => SEASON[s] ?? s;

/** The newest row for the first of the farmer's crops that has one. Never a different crop. */
export function heroFor(rows: MandiRow[], crops: string[]): { crop: string | null; row: MandiRow | null } {
  for (const id of crops) {
    const names = new Set(FARM_CROPS.find(c => c.id === id)?.commodities ?? []);
    const mine = rows.filter(r => names.has(r.commodity))
      .sort((a, b) => b.arrival_date.localeCompare(a.arrival_date) || a.market.localeCompare(b.market));
    if (mine.length) return { crop: id, row: mine[0] };
  }
  return { crop: crops[0] ?? null, row: null };
}

/** Where the modal price sits between that row's min and max (0-100). No bar without both. */
export function rangeBar(r: MandiRow): { min: number; modal: number; max: number; modalPct: number } | null {
  if (r.min_price == null || r.max_price == null || r.max_price <= r.min_price) return null;
  const pct = ((r.modal_price - r.min_price) / (r.max_price - r.min_price)) * 100;
  return { min: r.min_price, modal: r.modal_price, max: r.max_price, modalPct: Math.round(Math.min(100, Math.max(0, pct))) };
}

/**
 * IMD 24-hour rainfall categories (mm): very light trace-2.4, light 2.5-15.5, moderate 15.6-64.4,
 * heavy 64.5-115.5, very heavy 115.6-204.4, extremely heavy 204.5 or more.
 * Source: India Meteorological Department bulletin footnote, e.g.
 * https://mausam.imd.gov.in/hyderabad/mcdata/tgfcst.pdf (checked 2026-10-22).
 */
export type RainWord = "none" | "veryLight" | "light" | "moderate" | "heavy" | "veryHeavy" | "extreme";
export function rainWords(mm: number): RainWord {
  if (!(mm > 0)) return "none";
  if (mm < 2.5) return "veryLight";
  if (mm < 15.6) return "light";
  if (mm < 64.5) return "moderate";
  if (mm < 115.6) return "heavy";
  if (mm < 204.5) return "veryHeavy";
  return "extreme";
}

const locale = (lang: "hi" | "en") => (lang === "hi" ? "hi-IN" : "en-IN");
const asDate = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`);

/** "20 अक्टू॰" / "20 Oct" */
export function shortDate(iso: string | null | undefined, lang: "hi" | "en"): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return "";
  return asDate(iso).toLocaleDateString(locale(lang), { day: "numeric", month: "short", timeZone: "UTC" });
}

/** आज / कल / "शनि, 24 अक्टू॰" */
export function dayLabel(iso: string, todayIso: string, lang: "hi" | "en"): string {
  const diff = Math.round((asDate(iso).getTime() - asDate(todayIso).getTime()) / 86400000);
  if (diff === 0) return lang === "hi" ? "आज" : "Today";
  if (diff === 1) return lang === "hi" ? "कल" : "Tomorrow";
  return asDate(iso).toLocaleDateString(locale(lang), { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

export type AdviceLine = { icon: "check" | "drop" | "rain"; key: string; days: number | null };
export function adviceLine(r: { action: Action; daysUntil: number | null }): AdviceLine {
  const icon = r.action === "wait_rain" ? "rain" : r.action === "no_need" ? "check" : "drop";
  return { icon, key: `do_${r.action}`, days: r.action === "no_need" ? r.daysUntil : null };
}

function shift(iso: string, days: number): string {
  const d = asDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "When did you last water?" as plain choices. "2-3 days ago" counts as 3 (errs towards watering). */
export function wateredChoices(todayIso: string): { key: string; date: string | null }[] {
  return [
    { key: "w_today", date: todayIso }, { key: "w_yesterday", date: shift(todayIso, -1) },
    { key: "w_2_3", date: shift(todayIso, -3) }, { key: "w_week", date: shift(todayIso, -7) }, { key: "w_earlier", date: null },
  ];
}

/** Hindi for the 28 PlantDoc labels. Translations by the developer; to be checked by a KVK or native speaker. */
export const LEAF_LABEL_HI: Record<string, string> = {
  "Apple Scab Leaf": "सेब: स्कैब रोग",
  "Apple leaf": "सेब: स्वस्थ पत्ती",
  "Apple rust leaf": "सेब: रतुआ",
  "Bell_pepper leaf": "शिमला मिर्च: स्वस्थ पत्ती",
  "Bell_pepper leaf spot": "शिमला मिर्च: पत्ती धब्बा",
  "Blueberry leaf": "ब्लूबेरी: स्वस्थ पत्ती",
  "Cherry leaf": "चेरी: स्वस्थ पत्ती",
  "Corn Gray leaf spot": "मक्का: धूसर पत्ती धब्बा",
  "Corn leaf blight": "मक्का: पत्ती झुलसा",
  "Corn rust leaf": "मक्का: रतुआ",
  "Peach leaf": "आड़ू: स्वस्थ पत्ती",
  "Potato leaf early blight": "आलू: अगेती झुलसा",
  "Potato leaf late blight": "आलू: पछेती झुलसा",
  "Raspberry leaf": "रसभरी: स्वस्थ पत्ती",
  "Soyabean leaf": "सोयाबीन: स्वस्थ पत्ती",
  "Squash Powdery mildew leaf": "कद्दू: चूर्णी फफूंद (पाउडरी मिल्ड्यू)",
  "Strawberry leaf": "स्ट्रॉबेरी: स्वस्थ पत्ती",
  "Tomato Early blight leaf": "टमाटर: अगेती झुलसा",
  "Tomato Septoria leaf spot": "टमाटर: सेप्टोरिया पत्ती धब्बा",
  "Tomato leaf": "टमाटर: स्वस्थ पत्ती",
  "Tomato leaf bacterial spot": "टमाटर: जीवाणु धब्बा",
  "Tomato leaf late blight": "टमाटर: पछेती झुलसा",
  "Tomato leaf mosaic virus": "टमाटर: मोज़ेक वायरस",
  "Tomato leaf yellow virus": "टमाटर: पीला वायरस",
  "Tomato mold leaf": "टमाटर: पत्ती फफूंद",
  "Tomato two spotted spider mites leaf": "टमाटर: मकड़ी कीट (माइट)",
  "grape leaf": "अंगूर: स्वस्थ पत्ती",
  "grape leaf black rot": "अंगूर: काला सड़न",
};
