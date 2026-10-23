// Demo mode. 48 seeded synthetic farmers (clearly named "Demo Farmer N") across real districts,
// with consent, visits, irrigation notes and leaf-check history,
// and a real, dated Agmarknet snapshot for mandi prices. Demo rows have ids starting
// with DEMO-, are never queued for sync, and can be removed in one step.
import { stamp, type SyncRecord } from "../../../shared/sync.ts";
import type { MandiAnswer, MandiRow } from "./mandi.ts";

export const DEMO_PREFIX = "DEMO-";
/** The committed snapshot under web/public/ (checked by demo.test.ts). */
export const SNAPSHOT_FILE = "demo/mandi-snapshot-2026-10-20.json";
export const isDemoId = (id: string) => id.startsWith(DEMO_PREFIX);
export const DEMO_TABLES = ["farmer", "consent", "visit", "leaf_check"] as const;
export type DemoTable = (typeof DEMO_TABLES)[number];

// The oldest possible stamp: any real edit on the phone wins over demo values.
const DEMO_TS = "000000000000000:00000:demo";

/** mulberry32: tiny seeded PRNG, so the demo is the same on every device and in every test. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const DEMO_SEED = 2412;
export const DEMO_FARMERS = 48;

// Real districts where the field work happened; villages are invented ("Test…").
// Crops are the ones commonly grown there, so the demo looks plausible, not measured.
const DISTRICTS: { district: string; state: string; villages: string[]; crops: { crop: string; season: string }[]; water: string[] }[] = [
  { district: "Bhopal", state: "Madhya Pradesh", villages: ["Testpur", "Demo Kheda"], crops: [{ crop: "wheat", season: "rabi" }, { crop: "soybean", season: "kharif" }, { crop: "chickpea", season: "rabi" }], water: ["borewell", "rain only", "canal"] },
  { district: "Sehore", state: "Madhya Pradesh", villages: ["Testgaon", "Demo Tola"], crops: [{ crop: "wheat", season: "rabi" }, { crop: "soybean", season: "kharif" }], water: ["canal", "borewell"] },
  { district: "Indore", state: "Madhya Pradesh", villages: ["Demo Nagar", "Testkhedi"], crops: [{ crop: "onion", season: "rabi" }, { crop: "potato", season: "rabi" }, { crop: "soybean", season: "kharif" }], water: ["drip", "borewell"] },
  { district: "Raipur", state: "Chhattisgarh", villages: ["Testdih", "Demo Para"], crops: [{ crop: "rice", season: "kharif" }, { crop: "chickpea", season: "rabi" }], water: ["canal", "pond"] },
  { district: "Amravati", state: "Maharashtra", villages: ["Testwadi", "Demo Pur"], crops: [{ crop: "cotton", season: "kharif" }, { crop: "soybean", season: "kharif" }, { crop: "tomato", season: "rabi" }], water: ["rain only", "well"] },
  { district: "Bareilly", state: "Uttar Pradesh", villages: ["Testkheda", "Demo Ganj"], crops: [{ crop: "sugarcane", season: "perennial" }, { crop: "wheat", season: "rabi" }, { crop: "rice", season: "kharif" }], water: ["tubewell", "canal"] },
  { district: "Ahmedabad", state: "Gujarat", villages: ["Testpura"], crops: [{ crop: "cotton", season: "kharif" }, { crop: "wheat", season: "rabi" }], water: ["canal", "drip"] },
  { district: "Rajkot", state: "Gujarat", villages: ["Demo Vadi"], crops: [{ crop: "cotton", season: "kharif" }, { crop: "maize", season: "kharif" }], water: ["well", "drip"] },
  { district: "Anand", state: "Gujarat", villages: ["Testnagar"], crops: [{ crop: "tomato", season: "rabi" }, { crop: "potato", season: "rabi" }], water: ["canal", "borewell"] },
];

const PURPOSES = [
  { purpose: "पहली मुलाकात (नमूना) · first visit (demo)", observations: "नमूना नोट: खेत देखा, फ़सल ठीक · demo note: field seen, crop fine", advice_given: "पानी देने से पहले हाथ से मिट्टी की नमी देखें · check soil moisture by hand before watering" },
  { purpose: "सिंचाई सलाह (नमूना) · irrigation advice (demo)", observations: "नमूना नोट: पिछली सिंचाई 6 दिन पहले, मिट्टी सूखी · demo note: last watered 6 days ago, soil dry", advice_given: "ऐप की सिंचाई सलाह देखी; हल्की सिंचाई · checked the app's irrigation tip; light watering" },
  { purpose: "पत्ती जांच (नमूना) · leaf check (demo)", observations: "नमूना नोट: ऐप से पत्ती जांची · demo note: leaf checked with the app", advice_given: "धब्बे फैलें तो पत्ती KVK को दिखाएं · show the leaf to the KVK if spots spread" },
  { purpose: "मंडी भाव (नमूना) · mandi prices (demo)", observations: "नमूना नोट: भाव देखे, बेचने का फ़ैसला किसान का · demo note: prices checked, selling is the farmer's call", advice_given: "Agmarknet पर ताज़ा भाव देखें · check the latest Agmarknet price" },
];

// Crops the leaf model has classes for, with labels from labels.json (healthy first).
const LEAF_LABELS: Record<string, string[]> = {
  tomato: ["Tomato leaf", "Tomato Early blight leaf", "Tomato Septoria leaf spot", "Tomato leaf late blight", "Tomato leaf yellow virus"],
  potato: ["Potato leaf early blight", "Potato leaf late blight"],
  maize: ["Corn leaf blight", "Corn Gray leaf spot", "Corn rust leaf"],
  soybean: ["Soyabean leaf"],
};

function shift(todayIso: string, days: number): string {
  const d = new Date(`${todayIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export type DemoData = Record<DemoTable, SyncRecord[]>;

export function buildDemoData(todayIso: string, seed: number = DEMO_SEED): DemoData {
  const r = rng(seed);
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
  const farmer: SyncRecord[] = [], consent: SyncRecord[] = [], visit: SyncRecord[] = [], leaf_check: SyncRecord[] = [];
  for (let i = 0; i < DEMO_FARMERS; i++) {
    const n = i + 1, id = `${DEMO_PREFIX}F${n}`;
    const place = DISTRICTS[i % DISTRICTS.length];
    const land = Math.round((0.5 + r() * 5.5) * 2) / 2;
    const first = pick(place.crops);
    const second = r() < 0.5 ? pick(place.crops.filter(c => c.crop !== first.crop)) : undefined;
    const crops = [first, ...(second ? [second] : [])].map(c => ({ ...c, area_acres: second ? Math.round(land * 5) / 10 : land }));
    // Farmer 8 joined 2 days ago, so "added this week" has someone; others over the last ~4 months.
    const onboarded = i === 7 ? shift(todayIso, -2) : shift(todayIso, -(20 + Math.floor(r() * 100)));
    farmer.push(stamp(null, {
      id, deleted: 0, name: `Demo Farmer ${n}`, phone: null, village: pick(place.villages), block: null, district: place.district, state: place.state,
      lat: null, lng: null, land_acres: land, irrigation_source: pick(place.water), crops, language: place.state === "Gujarat" ? "gu-IN" : place.state === "Maharashtra" ? "mr-IN" : "hi-IN",
      onboarded_at: onboarded, source: "app", source_ref: "demo", notes: "नमूना डेटा, असली व्यक्ति नहीं · Demo data, not a real person",
    }, DEMO_TS));
    const research = r() < 0.4 ? 1 : 0;
    consent.push(stamp(null, {
      id: `${DEMO_PREFIX}C${n}`, deleted: 0, subject_type: "farmer", subject_id: id, given_by: r() < 0.9 ? "self" : "guardian",
      guardian_name: null, guardian_relation: null, method: pick(["paper_signed", "verbal_recorded"]),
      scope_store: 1, scope_sync: 0, scope_research_aggregate: research, language: "hi-IN", recorded_at: onboarded,
    }, DEMO_TS));
    const nVisits = [0, 2, 4].includes(i) ? 1 : 1 + Math.floor(r() * 3); // open follow-ups stay open
    for (let j = 0; j < nVisits; j++) {
      const on = shift(onboarded, j * (10 + Math.floor(r() * 15)));
      if (on > todayIso) break;
      const v = j === 0 ? PURPOSES[0] : pick(PURPOSES.slice(1));
      visit.push(stamp(null, {
        id: `${DEMO_PREFIX}V${n}-${j + 1}`, deleted: 0, farmer_id: id, visited_on: on, ...v,
        // Follow-ups: Farmer 1 due today, Farmer 3 two days overdue, Farmer 5 next week.
        follow_up_on: j === 0 ? ({ 0: shift(todayIso, 0), 2: shift(todayIso, -2), 4: shift(todayIso, 7) } as Record<number, string>)[i] ?? null : null,
        source: "app", source_ref: "demo",
      }, DEMO_TS));
      const leafCrop = crops.find(c => LEAF_LABELS[c.crop])?.crop;
      if (v === PURPOSES[2] && leafCrop) {
        // A made-up model output, shaped like a real one: three labels, probabilities summing below 1.
        const labels = [...LEAF_LABELS[leafCrop]];
        const top = labels.splice(Math.floor(r() * labels.length), 1)[0];
        const p1 = Math.round((0.35 + r() * 0.5) * 100) / 100;
        const rest = [...labels, "Tomato leaf", "Potato leaf early blight"].filter(l => l !== top).slice(0, 2);
        const p2 = Math.round(((1 - p1) * 0.6) * 100) / 100, p3 = Math.round(((1 - p1) * 0.25) * 100) / 100;
        leaf_check.push(stamp(null, {
          id: `${DEMO_PREFIX}L${n}-${j + 1}`, deleted: 0, farmer_id: id, crop: leafCrop,
          top3: [{ label: top, prob: p1 }, { label: rest[0], prob: p2 }, { label: rest[1], prob: p3 }],
          abstained: p1 < 0.6 ? 1 : 0, checked_at: `${on}T06:30:00.000Z`,
        }, DEMO_TS));
      }
    }
  }
  return { farmer, consent, visit, leaf_check };
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
