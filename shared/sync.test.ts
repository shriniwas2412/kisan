import { test } from "node:test";
import assert from "node:assert/strict";
import { createClock, encode, decode, stamp, tombstone, mergeRecord, mergeAll, maxStamp, ulid, type SyncRecord } from "./sync.ts";

test("clock never goes backwards even if the wall clock does", () => {
  let now = 1000;
  const c = createClock("a", () => now);
  const t1 = c.tick(); now = 500; const t2 = c.tick(); const t3 = c.tick();
  assert.ok(t1 < t2 && t2 < t3);
  assert.deepEqual(decode(t3), { wall: 1000, counter: 2, node: "a" });
});

test("observing a remote timestamp from the future moves the clock past it", () => {
  const c = createClock("a", () => 1000);
  const remote = encode({ wall: 5000, counter: 3, node: "b" });
  c.observe(remote);
  assert.ok(c.tick() > remote);
});

test("encoded timestamps sort like numbers", () => {
  assert.ok(encode({ wall: 99, counter: 0, node: "z" }) < encode({ wall: 100, counter: 0, node: "a" }));
  assert.ok(encode({ wall: 100, counter: 9, node: "z" }) < encode({ wall: 100, counter: 10, node: "a" }));
});

// Two phones edit the same synthetic farmer offline.
const base = stamp(null, { id: "f1", name: "Test Farmer 1", village: "Testpur", notes: "" }, "t1:a");
const phoneA = stamp(base, { ...base, village: "Testpur Kalan" }, "t2:a");
const phoneB = stamp(base, { ...base, notes: "follow up next week" }, "t3:b");

test("concurrent edits to different fields are both kept", () => {
  const m = mergeRecord(phoneA, phoneB);
  assert.equal(m.village, "Testpur Kalan");
  assert.equal(m.notes, "follow up next week");
});

test("same field edited on both: the later write wins, in either order", () => {
  const x = stamp(base, { ...base, name: "Test Farmer 1A" }, "t5:a");
  const y = stamp(base, { ...base, name: "Test Farmer 1B" }, "t6:b");
  assert.equal(mergeRecord(x, y).name, "Test Farmer 1B");
  assert.equal(mergeRecord(y, x).name, "Test Farmer 1B");
});

test("a delete syncs, and a later edit can bring the record back", () => {
  const del = tombstone(phoneA, "t7:a");
  assert.equal(mergeAll([phoneB], [del])[0].deleted, 1);
  const revived = stamp(del, { ...del, deleted: 0 }, "t8:b");
  assert.equal(mergeRecord(del, revived).deleted, 0);
});

const strip = (l: SyncRecord[]) => JSON.stringify(l);
const lists = [[phoneA], [phoneB, stamp(null, { id: "f2", name: "Test Farmer 2" }, "t4:b")], [tombstone(base, "t9:c")]];

test("merge is commutative, associative and idempotent", () => {
  const [a, b, c] = lists;
  assert.equal(strip(mergeAll(a, b)), strip(mergeAll(b, a)));
  assert.equal(strip(mergeAll(mergeAll(a, b), c)), strip(mergeAll(a, mergeAll(b, c))));
  assert.equal(strip(mergeAll(mergeAll(a, b), b)), strip(mergeAll(a, b)));
});

test("randomised: every merge order of 5 phones gives the same result", () => {
  let seed = 7; const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  const fields = ["name", "village", "notes", "crops"];
  const phones = Array.from({ length: 5 }, (_, p) => Array.from({ length: 3 }, (_, i) => {
    const rec: SyncRecord = { id: "f" + i };
    for (const f of fields) if (rand() < 0.6) rec[f] = `${f}-${p}`;
    return stamp(null, rec, `${String(Math.floor(rand() * 50)).padStart(3, "0")}:${p}`);
  }));
  const ref = strip(phones.reduce(mergeAll, []));
  for (let k = 0; k < 30; k++) {
    const order = [...phones].sort(() => rand() - 0.5);
    assert.equal(strip(order.reduce(mergeAll, [])), ref);
  }
});

test("maxStamp finds the newest timestamp", () => {
  assert.equal(maxStamp([phoneA, phoneB]), "t3:b");
});

test("ulid is 26 chars and sorts by time", () => {
  const a = ulid(1000), b = ulid(2000);
  assert.equal(a.length, 26);
  assert.ok(a < b);
});
