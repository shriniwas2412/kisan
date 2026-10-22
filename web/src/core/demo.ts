// Demo mode. Synthetic farmers (clearly named "Demo Farmer N") with consent and visits,
// and a real, dated Agmarknet snapshot for mandi prices. Demo rows have ids starting
// with DEMO-, are never queued for sync, and can be removed in one step.
import { stamp, type SyncRecord } from "../../../shared/sync.ts";
import type { MandiAnswer, MandiRow } from "./mandi.ts";

export const DEMO_PREFIX = "DEMO-";
/** The committed snapshot under web/public/ (checked by demo.test.ts). */
export const SNAPSHOT_FILE = "demo/mandi-snapshot-2026-10-20.json";
export const isDemoId = (id: string) => id.startsWith(DEMO_PREFIX);
export const DEMO_TABLES = ["farmer", "consent", "visit"] as const;
export type DemoTable = (typeof DEMO_TABLES)[number];

// The oldest possible stamp: any real edit on the phone wins over demo values.
const DEMO_TS = "000000000000000:00000:demo";

const PEOPLE: { village: string; district: string; state: string; crops: { crop: string; season: string; area_acres: number }[]; land: number; water: string }[] = [
  { village: "Testpur", district: "Bhopal", state: "Madhya Pradesh", crops: [{ crop: "wheat", season: "rabi", area_acres: 2 }, { crop: "soybean", season: "kharif", area_acres: 2 }], land: 2, water: "borewell" },
  { village: "Testpur", district: "Bhopal", state: "Madhya Pradesh", crops: [{ crop: "chickpea", season: "rabi", area_acres: 1.5 }], land: 1.5, water: "rain only" },
  { village: "Testgaon", district: "Sehore", state: "Madhya Pradesh", crops: [{ crop: "wheat", season: "rabi", area_acres: 4 }], land: 4, water: "canal" },
  { village: "Testgaon", district: "Vidisha", state: "Madhya Pradesh", crops: [{ crop: "soybean", season: "kharif", area_acres: 3 }], land: 3, water: "well" },
  { village: "Demo Nagar", district: "Indore", state: "Madhya Pradesh", crops: [{ crop: "onion", season: "rabi", area_acres: 1 }], land: 1, water: "drip" },
  { village: "Demo Nagar", district: "Raipur", state: "Chhattisgarh", crops: [{ crop: "rice", season: "kharif", area_acres: 2.5 }], land: 2.5, water: "canal" },
  { village: "Testwadi", district: "Amravati", state: "Maharashtra", crops: [{ crop: "cotton", season: "kharif", area_acres: 5 }], land: 5, water: "rain only" },
  { village: "Testkheda", district: "Bareilly", state: "Uttar Pradesh", crops: [{ crop: "sugarcane", season: "perennial", area_acres: 3 }], land: 3, water: "tubewell" },
];

const VISITS = [
  { purpose: "पहली मुलाकात (नमूना) · first visit (demo)", observations: "नमूना नोट: खेत देखा · demo note: field visit", advice_given: "पानी देने से पहले हाथ से मिट्टी की नमी देखें · check soil moisture by hand before watering" },
  { purpose: "दोबारा मुलाकात (नमूना) · follow-up (demo)", observations: "नमूना नोट: ऐप से पत्ती जांची · demo note: leaf checked with the app", advice_given: "धब्बे फैलें तो पत्ती KVK को दिखाएं · show the leaf to the KVK if spots spread" },
];

function shift(todayIso: string, days: number): string {
  const d = new Date(`${todayIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export type DemoData = Record<DemoTable, SyncRecord[]>;

export function buildDemoData(todayIso: string): DemoData {
  const farmer: SyncRecord[] = [], consent: SyncRecord[] = [], visit: SyncRecord[] = [];
  PEOPLE.forEach((p, i) => {
    const n = i + 1, id = `${DEMO_PREFIX}F${n}`;
    // Demo Farmer 8 joined 2 days ago, so the field worker's "added this week" list has someone.
    const onboarded = i === 7 ? shift(todayIso, -2) : shift(todayIso, -30 - i * 3);
    farmer.push(stamp(null, {
      id, deleted: 0, name: `Demo Farmer ${n}`, phone: null, village: p.village, block: null, district: p.district, state: p.state,
      lat: null, lng: null, land_acres: p.land, irrigation_source: p.water, crops: p.crops, language: "hi-IN",
      onboarded_at: onboarded, source: "app", source_ref: "demo", notes: "नमूना डेटा, असली व्यक्ति नहीं · Demo data, not a real person",
    }, DEMO_TS));
    consent.push(stamp(null, {
      id: `${DEMO_PREFIX}C${n}`, deleted: 0, subject_type: "farmer", subject_id: id, given_by: "self", method: "paper_signed",
      scope_store: 1, scope_sync: 0, scope_research_aggregate: 0, language: "hi-IN", recorded_at: onboarded,
    }, DEMO_TS));
    VISITS.slice(0, 1 + (i % 2)).forEach((v, j) => visit.push(stamp(null, {
      id: `${DEMO_PREFIX}V${n}-${j + 1}`, deleted: 0, farmer_id: id, visited_on: shift(onboarded, j * 14), ...v,
      // Follow-ups: Demo Farmer 1 due today, Demo Farmer 3 two days overdue, Demo Farmer 5 next week.
      follow_up_on: j === 0 ? ({ 0: shift(todayIso, 0), 2: shift(todayIso, -2), 4: shift(todayIso, 7) } as Record<number, string>)[i] ?? null : null,
      source: "app", source_ref: "demo",
    }, DEMO_TS)));
  });
  return { farmer, consent, visit };
}

/** Minimal storage the demo needs; the app passes IndexedDB, tests pass a Map. */
export type DemoStore = {
  put(table: DemoTable, row: SyncRecord): Promise<void>;
  ids(table: DemoTable): Promise<string[]>;
  del(table: DemoTable, id: string): Promise<void>;
  outboxKeys(): Promise<string[]>;
  delOutbox(key: string): Promise<void>;
};

export async function loadDemo(store: DemoStore, data: DemoData): Promise<number> {
  let n = 0;
  for (const t of DEMO_TABLES) for (const r of data[t]) { await store.put(t, r); n++; }
  return n;
}

/** Removes every demo row (and any queued demo edit). Real rows are untouched. */
export async function clearDemo(store: DemoStore): Promise<number> {
  let n = 0;
  for (const t of DEMO_TABLES) for (const id of await store.ids(t)) if (isDemoId(id)) { await store.del(t, id); n++; }
  for (const k of await store.outboxKeys()) if (isDemoId(k.split(":")[1] ?? "")) await store.delOutbox(k);
  return n;
}

// ---- mandi snapshot ----
export type MandiSnapshot = {
  source: string; dataset_url: string; fetched_at: string; as_of: string; unit: string; records: MandiRow[];
};

/** Snapshot rows for a place: that district if it has rows, otherwise the whole state, otherwise none. */
export function snapshotAnswer(s: MandiSnapshot, state: string, district?: string): { answer: MandiAnswer; scope: "district" | "state" } {
  const inState = s.records.filter(r => r.state === state);
  const inDistrict = district ? inState.filter(r => r.district === district) : [];
  const records = inDistrict.length ? inDistrict : inState;
  if (!records.length) return { answer: { available: false, reason: "no_records" }, scope: "state" };
  const asOf = records.reduce((m, r) => (r.arrival_date > m ? r.arrival_date : m), "");
  return {
    answer: { available: true, stale: true, source: "agmarknet", unit: s.unit, as_of: asOf, fetched_at: s.fetched_at, total: records.length, truncated: false, records },
    scope: inDistrict.length ? "district" : "state",
  };
}

export function snapshotLabel(asOfIso: string, lang: "hi" | "en"): string {
  const [y, m, d] = asOfIso.split("-");
  const date = `${d}/${m}/${y}`;
  return lang === "hi" ? `${date} का भाव · नमूना स्नैपशॉट (आज का नहीं)` : `As of ${date} · demo snapshot (not today's price)`;
}

/** The farmer view in demo opens straight on the home screen (Bhopal; wheat and onion; last watered 5 days ago). */
export function demoFarmerProfile(todayIso: string) {
  return {
    placeId: "bhopal", crops: ["wheat", "onion"], commodities: [] as string[],
    irr: { crop: "wheat", soil: "clay", stage: "mid", lastWatered: shift(todayIso, -5), areaAcres: "1" },
  };
}
