import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { buildDemoData, loadDemo, clearDemo, isDemoId, snapshotAnswer, snapshotLabel, DEMO_TABLES, type DemoStore, type MandiSnapshot } from "./demo.ts";
import { checkRow, consentAllowsStore } from "../../../shared/schema.ts";
import type { SyncRecord } from "../../../shared/sync.ts";

const data = buildDemoData("2026-10-20");

test("demo data: 8 clearly named synthetic farmers, each valid and with consent", () => {
  assert.equal(data.farmer.length, 8);
  for (const f of data.farmer) {
    assert.match(String(f.name), /^Demo Farmer \d$/);
    assert.ok(isDemoId(f.id));
    assert.equal(f.phone, null, "no phone numbers in demo data");
    assert.deepEqual(checkRow("farmer", f).problems, [], f.id);
    assert.ok(data.consent.some(c => c.subject_id === f.id && consentAllowsStore(c)), `consent for ${f.id}`);
  }
  for (const v of data.visit) {
    assert.deepEqual(checkRow("visit", v).problems, [], v.id);
    assert.ok(data.farmer.some(f => f.id === v.farmer_id));
  }
  for (const c of data.consent) assert.deepEqual(checkRow("consent", c).problems, [], c.id);
});

function memStore(): DemoStore & { tables: Map<string, Map<string, SyncRecord>>; outbox: Set<string> } {
  const tables = new Map(DEMO_TABLES.map(t => [t, new Map<string, SyncRecord>()] as [string, Map<string, SyncRecord>]));
  const outbox = new Set<string>();
  return {
    tables, outbox,
    async put(t, r) { tables.get(t)!.set(r.id, r); },
    async ids(t) { return [...tables.get(t)!.keys()]; },
    async del(t, id) { tables.get(t)!.delete(id); },
    async outboxKeys() { return [...outbox]; },
    async delOutbox(k) { outbox.delete(k); },
  };
}

test("demo crops use the app's crop ids, and demo text is marked as demo in Hindi and English", async () => {
  const { FARM_CROPS } = await import("./farmView.ts");
  const ids = new Set(FARM_CROPS.map(c => c.id));
  for (const f of data.farmer) for (const c of f.crops as { crop: string }[]) assert.ok(ids.has(c.crop), c.crop);
  for (const v of data.visit) assert.match(String(v.purpose), /नमूना.*demo/);
});

test("load puts demo rows in without queuing them; clear removes only demo rows", async () => {
  const s = memStore();
  await s.put("farmer", { id: "01REALFARMER", name: "Test Farmer 1" });
  s.outbox.add("farmer:01REALFARMER");
  const n = await loadDemo(s, data);
  assert.equal(n, data.farmer.length + data.consent.length + data.visit.length);
  assert.equal(s.outbox.size, 1, "demo rows are not queued for sync");
  s.outbox.add("farmer:DEMO-F1"); // an edit to a demo farmer
  const removed = await clearDemo(s);
  assert.equal(removed, n);
  assert.deepEqual([...s.tables.get("farmer")!.keys()], ["01REALFARMER"]);
  assert.equal(s.tables.get("visit")!.size, 0);
  assert.deepEqual([...s.outbox], ["farmer:01REALFARMER"]);
});

import { SNAPSHOT_FILE } from "./demo.ts";
const snapFile = readdirSync(new URL("../../public/demo/", import.meta.url)).find(f => /^mandi-snapshot-\d{4}-\d{2}-\d{2}\.json$/.test(f))!;
const snap = JSON.parse(readFileSync(new URL(`../../public/demo/${snapFile}`, import.meta.url), "utf8")) as MandiSnapshot;

test("the committed mandi snapshot is real, dated and sourced", () => {
  assert.equal(snap.source, "Agmarknet via data.gov.in");
  assert.match(snap.dataset_url, /^https:\/\/data\.gov\.in\/resource\//);
  assert.equal(snapFile, `mandi-snapshot-${snap.fetched_at.slice(0, 10)}.json`);
  assert.equal(SNAPSHOT_FILE, `demo/${snapFile}`);
  assert.ok(snap.records.length > 0 && snap.records.length <= 20);
  for (const r of snap.records) {
    assert.match(r.arrival_date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(r.modal_price > 0);
  }
});

test("snapshot answers are always marked old, by district first then state", () => {
  const bhopal = snapshotAnswer(snap, "Madhya Pradesh", "Bhopal");
  assert.equal(bhopal.answer.available, true);
  if (bhopal.answer.available) {
    assert.equal(bhopal.answer.stale, true);
    assert.ok(bhopal.answer.records.every(r => r.state === "Madhya Pradesh"));
  }
  const other = snapshotAnswer(snap, "Madhya Pradesh", "Nowhere");
  assert.equal(other.scope, "state");
  assert.deepEqual(snapshotAnswer(snap, "Test State").answer, { available: false, reason: "no_records" });
});

test("snapshot label says demo snapshot and the date, in Hindi and English", () => {
  assert.equal(snapshotLabel("2026-10-20", "en"), "As of 20/10/2026 · demo snapshot (not today's price)");
  assert.match(snapshotLabel("2026-10-20", "hi"), /^20\/10\/2026 का भाव · नमूना स्नैपशॉट/);
});

test("README demo numbers match the demo data and the snapshot", () => {
  const readme = readFileSync(new URL("../../../README.md", import.meta.url), "utf8");
  assert.ok(readme.includes(`${data.farmer.length} farmers named "Demo Farmer 1" to "Demo Farmer ${data.farmer.length}"`));
  assert.ok(readme.includes(`shows ${snap.records.length} Agmarknet rows`));
  assert.ok(readme.includes(snapFile));
});

test("demo farmer profile: Bhopal, wheat and onion, last watered 5 days before the demo loads", async () => {
  const { demoFarmerProfile } = await import("./demo.ts");
  const p = demoFarmerProfile("2026-10-22");
  assert.equal(p.placeId, "bhopal");
  assert.deepEqual(p.crops, ["wheat", "onion"]);
  assert.equal(p.irr.lastWatered, "2026-10-17");
});

test("demo shows a field worker's day: one follow-up due today, one overdue, one farmer added this week", async () => {
  const { todayList } = await import("./today.ts");
  const d = buildDemoData("2026-10-22");
  const r = todayList(d.farmer as never, d.visit as never, [], "2026-10-22");
  assert.deepEqual(r.due.map(x => [x.farmer.name, x.overdueDays]), [["Demo Farmer 3", 2], ["Demo Farmer 1", 0]]);
  assert.deepEqual(r.recent.map(f => f.name), ["Demo Farmer 8"]);
});
