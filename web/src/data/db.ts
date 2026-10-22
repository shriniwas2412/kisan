// IndexedDB store, offline first. Every local write is stamped with this device's
// hybrid logical clock and queued in the outbox; sync() pushes the outbox and merges
// whatever the server sends back, field by field (same CRDT as the server).
import { openDB, type IDBPDatabase } from "idb";
import { createClock, maxStamp, stamp, ulid, type Clock, type SyncRecord } from "../../../shared/sync.ts";
import { applyRemote, pushPlan, tombstoneFields } from "../core/syncScope.ts";
import type { TableName } from "../../../shared/schema.ts";
import { buildDemoData, demoFarmerProfile, clearDemo as clearDemoRows, isDemoId, loadDemo as loadDemoRows, type DemoStore } from "../core/demo.ts";

const TABLES: TableName[] = ["farmer", "consent", "visit", "leaf_check", "mandi_price_manual"];
type Store = TableName | "meta" | "outbox" | "cache";

let dbp: Promise<IDBPDatabase> | null = null;
function db() {
  dbp ??= openDB("kisan", 1, {
    upgrade(d) {
      for (const t of TABLES) d.createObjectStore(t, { keyPath: "id" });
      d.createObjectStore("meta");
      d.createObjectStore("outbox");
      d.createObjectStore("cache");
    },
  });
  return dbp;
}

export async function meta<T>(key: string): Promise<T | undefined> {
  return (await db()).get("meta", key);
}
export async function setMeta(key: string, value: unknown) {
  await (await db()).put("meta", value, key);
}

let clockP: Promise<Clock> | null = null;
function clock(): Promise<Clock> {
  clockP ??= (async () => {
    let device = await meta<string>("device");
    if (!device) { device = "d" + ulid().slice(-10); await setMeta("device", device); }
    const c = createClock(device);
    c.observe((await meta<string>("lastStamp")) ?? "");
    return c;
  })();
  return clockP;
}

async function tick(): Promise<string> {
  const ts = (await clock()).tick();
  await setMeta("lastStamp", ts);
  return ts;
}

export async function all<T = SyncRecord>(table: TableName): Promise<T[]> {
  const rows = (await (await db()).getAll(table)) as SyncRecord[];
  return rows.filter(r => !Number(r.deleted)) as T[];
}

export async function get<T = SyncRecord>(table: TableName, id: string): Promise<T | undefined> {
  return (await db()).get(table, id);
}

/** Save a record (new or edited). Only changed fields get a new stamp. */
export async function save<T extends Record<string, unknown>>(table: TableName, rec: T & { id?: string }): Promise<SyncRecord> {
  const d = await db();
  const id = rec.id || ulid();
  const prev = (await d.get(table, id)) as SyncRecord | undefined;
  const ts = await tick();
  const next = stamp(prev, { deleted: 0, ...(prev ?? {}), ...rec, id } as SyncRecord, ts);
  const tx = d.transaction([table, "outbox"], "readwrite");
  await tx.objectStore(table).put(next);
  // The outbox remembers which write is queued; sync only clears it if nothing newer came in.
  await tx.objectStore("outbox").put(ts, `${table}:${id}`);
  await tx.done;
  notify();
  return next;
}

/** Delete a row on this phone: deleted=1 and its personal fields cleared (not just hidden). */
export async function remove(table: TableName, id: string) {
  const fields = table === "farmer" || table === "visit" || table === "leaf_check" ? tombstoneFields(table) : { deleted: 1 };
  await save(table, { id, ...fields });
}

export async function outboxKeys(): Promise<string[]> {
  return (await (await db()).getAllKeys("outbox")) as string[];
}

export async function pendingCount(): Promise<number> {
  return (await db()).count("outbox");
}

// --- small cache (weather, mandi answers) ---
export async function cacheGet<T>(key: string): Promise<{ at: number; value: T } | undefined> {
  return (await db()).get("cache", key);
}
export async function cachePut(key: string, value: unknown) {
  await (await db()).put("cache", { at: Date.now(), value }, key);
}

// --- change notifications for the UI ---
const listeners = new Set<() => void>();
export function onChange(fn: () => void) { listeners.add(fn); return () => listeners.delete(fn); }
function notify() { for (const fn of listeners) fn(); }

// --- sync ---
export type SyncReport = { at: string; accepted: number; rejected: { table: string; id: string; reason: string }[]; pulled: number;
  /** Rows kept on this phone because the farmer did not agree to sync. */ keptLocal: number };

/** Push the outbox, pull changes, merge. Throws on network or auth errors. */
export async function sync(fetchImpl: typeof fetch = fetch): Promise<SyncReport> {
  const d = await db();
  const report: SyncReport = { at: new Date().toISOString(), accepted: 0, rejected: [], pulled: 0, keptLocal: 0 };
  let more = true;
  let first = true;
  while (more) {
    // Only farmers who agreed to sync (and never demo rows) leave the phone.
    let keys: string[] = [];
    if (first) {
      const all = (await d.getAllKeys("outbox")) as string[];
      const rows = new Map<string, SyncRecord>();
      for (const k of all) { const [t, id] = k.split(":"); const r = await d.get(t, id); if (r) rows.set(k, r); }
      const plan = pushPlan(all, k => rows.get(k), (await d.getAll("consent")) as SyncRecord[]);
      keys = plan.push;
      report.keptLocal = plan.keptLocal.length;
    }
    const queued = new Map<string, string>();
    for (const k of keys) queued.set(k, await d.get("outbox", k));
    first = false;
    const changes: Record<string, SyncRecord[]> = {};
    for (const k of keys) {
      const [t, id] = k.split(":");
      const r = await d.get(t, id);
      if (r) (changes[t] ??= []).push(r);
    }
    const res = await fetchImpl("/api/sync", {
      method: "POST", credentials: "include", headers: { "content-type": "application/json" },
      body: JSON.stringify({ since: (await meta<number>("cursor")) ?? 0, changes }),
    });
    if (!res.ok) throw new Error(res.status === 401 ? "signin" : `sync ${res.status}`);
    const body = await res.json() as { accepted: number; rejected: SyncReport["rejected"]; cursor: number; more: boolean; changes: Record<string, SyncRecord[]> };
    report.accepted += body.accepted;
    report.rejected.push(...body.rejected);
    const c = await clock();
    for (const [t, list] of Object.entries(body.changes)) {
      c.observe(maxStamp(list));
      for (const remote of list) {
        await d.put(t, applyRemote(await d.get(t, remote.id), remote));
        // A record deleted on the server can't be edited back; drop any queued edit to it.
        if (Number(remote.deleted)) await d.delete("outbox", `${t}:${remote.id}`);
        report.pulled++;
      }
    }
    // Accepted records leave the outbox. Rejected ones stay, so nothing is lost silently.
    const bad = new Set(body.rejected.map(r => `${r.table}:${r.id}`));
    for (const k of keys) if (!bad.has(k) && (await d.get("outbox", k)) === queued.get(k)) await d.delete("outbox", k);
    await setMeta("cursor", body.cursor);
    more = body.more;
  }
  await setMeta("lastSync", report);
  notify();
  return report;
}

// --- demo data ---
function demoStore(d: IDBPDatabase): DemoStore {
  return {
    put: async (t, r) => { await d.put(t, r); },
    ids: async t => (await d.getAllKeys(t)) as string[],
    del: async (t, id) => { await d.delete(t, id); },
    outboxKeys: async () => (await d.getAllKeys("outbox")) as string[],
    delOutbox: async k => { await d.delete("outbox", k); },
  };
}

export const isDemoLoaded = async () => !!(await meta<string>("demoLoadedAt"));

export async function loadDemo(todayIso: string) {
  await loadDemoRows(demoStore(await db()), buildDemoData(todayIso));
  if (!(await meta("farmerProfile"))) await setMeta("farmerProfile", demoFarmerProfile(todayIso));
  await setMeta("demoLoadedAt", new Date().toISOString());
  notify();
}

export async function clearDemo() {
  const d = await db();
  await clearDemoRows(demoStore(d));
  // Rows the user added to a demo farmer (a visit, a leaf check) go too.
  for (const t of ["visit", "leaf_check"] as const) {
    for (const r of (await d.getAll(t)) as SyncRecord[]) {
      if (isDemoId(String(r.farmer_id ?? ""))) { await d.delete(t, r.id); await d.delete("outbox", `${t}:${r.id}`); }
    }
  }
  await setMeta("demoLoadedAt", null);
  await setMeta("demoCleared", true);
  notify();
}
