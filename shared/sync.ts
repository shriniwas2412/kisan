// Offline multi-device sync: last-writer-wins map per record (a state-based CRDT,
// Shapiro et al. 2011) with hybrid logical clock timestamps (Kulkarni et al. 2014).
//
// Every field carries the timestamp of its last write in `_v`. Merge keeps, field by
// field, the value with the larger timestamp. Deletes are the `deleted` field, so they
// merge like any edit. Merge is commutative, associative and idempotent (tested), so
// the order in which phones and the server exchange records does not matter.

export type Stamps = Record<string, string>;
export type SyncRecord = { id: string; _v?: Stamps; [field: string]: unknown };

const META = new Set(["id", "_v"]);

export type Hlc = { wall: number; counter: number; node: string };

/** Fixed-width string so plain string comparison orders timestamps correctly. */
export function encode({ wall, counter, node }: Hlc): string {
  return `${String(wall).padStart(15, "0")}:${String(counter).padStart(5, "0")}:${node}`;
}

export function decode(ts: string): Hlc {
  const [wall, counter, ...node] = ts.split(":");
  return { wall: Number(wall), counter: Number(counter), node: node.join(":") };
}

export type Clock = { node: string; tick(): string; observe(ts: string): void };

/** Hybrid logical clock for one device. `now` is injectable for tests. */
export function createClock(node: string, now: () => number = () => Date.now()): Clock {
  let last = { wall: 0, counter: 0 };
  return {
    node,
    tick() {
      const pt = now();
      if (pt > last.wall) last = { wall: pt, counter: 0 };
      else last = { wall: last.wall, counter: last.counter + 1 };
      return encode({ ...last, node });
    },
    observe(ts) {
      if (!ts) return;
      const r = decode(ts), pt = now();
      const wall = Math.max(pt, last.wall, r.wall);
      let counter = 0;
      if (wall === last.wall && wall === r.wall) counter = Math.max(last.counter, r.counter) + 1;
      else if (wall === last.wall) counter = last.counter + 1;
      else if (wall === r.wall) counter = r.counter + 1;
      last = { wall, counter };
    },
  };
}

/** Stamp every field that changed between `prev` and `next` with `ts`. */
export function stamp<T extends SyncRecord>(prev: SyncRecord | null | undefined, next: T, ts: string): T {
  const v: Stamps = { ...(prev?._v || {}) };
  for (const k of Object.keys(next)) {
    if (META.has(k)) continue;
    if (!prev || JSON.stringify(prev[k]) !== JSON.stringify(next[k])) v[k] = ts;
  }
  return { ...next, _v: v };
}

export function tombstone<T extends SyncRecord>(rec: T, ts: string): T {
  return { ...rec, deleted: 1, _v: { ...(rec._v || {}), deleted: ts } };
}

/** Field-wise last-writer-wins merge of two versions of the same record. */
export function mergeRecord(a: SyncRecord | undefined, b: SyncRecord | undefined): SyncRecord {
  if (!a) return b as SyncRecord;
  if (!b) return a;
  const out: SyncRecord = { id: a.id };
  const v: Stamps = {};
  // Sorted keys so the merged object is byte-identical whatever the merge order.
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(k => !META.has(k)).sort();
  for (const k of keys) {
    const ta = a._v?.[k] ?? "", tb = b._v?.[k] ?? "";
    // Equal stamps only happen for unstamped (imported) fields; break the tie on the value.
    const pick = tb > ta || (tb === ta && JSON.stringify(b[k]) > JSON.stringify(a[k])) ? b : a;
    if (k in pick) out[k] = pick[k];
    const ts = tb > ta ? tb : ta;
    if (ts) v[k] = ts;
  }
  out._v = v;
  return out;
}

/** Merge two record lists by id. */
export function mergeAll(listA: SyncRecord[], listB: SyncRecord[]): SyncRecord[] {
  const m = new Map(listA.map(r => [r.id, r]));
  for (const r of listB) m.set(r.id, mergeRecord(m.get(r.id), r));
  return [...m.values()].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
}

/** Largest timestamp in one record. */
export function recordStamp(r: SyncRecord): string {
  let max = "";
  for (const ts of Object.values(r._v || {})) if (ts > max) max = ts;
  return max;
}

/** Largest timestamp in a list, so a clock can observe() what it received. */
export function maxStamp(list: SyncRecord[]): string {
  let max = "";
  for (const r of list) { const s = recordStamp(r); if (s > max) max = s; }
  return max;
}

/** Sortable, time-ordered unique id (ULID-like: 10 chars time + 16 chars random, Crockford base32). */
const B32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const cryptoRand = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
export function ulid(now: number = Date.now(), rand: () => number = cryptoRand): string {
  let t = "", n = now;
  for (let i = 0; i < 10; i++) { t = B32[n % 32] + t; n = Math.floor(n / 32); }
  let r = "";
  for (let i = 0; i < 16; i++) r += B32[Math.floor(rand() * 32)];
  return t + r;
}
