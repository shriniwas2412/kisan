import { test } from "node:test";
import assert from "node:assert/strict";
import { setup, signIn } from "./helpers.ts";
import { createClock, stamp, type SyncRecord } from "../../shared/sync.ts";

const NOW = Date.parse("2026-10-19T10:00:00Z");
const phone = (node: string) => { let t = NOW; return createClock(node, () => (t += 1)); };

function consentFor(farmerId: string, ts: string, extra = {}) {
  return stamp(null, { id: "C-" + farmerId, subject_type: "farmer", subject_id: farmerId, given_by: "self", method: "paper_signed",
    scope_store: 1, scope_sync: 1, recorded_at: "2026-10-19", deleted: 0, ...extra }, ts);
}
const farmer = (id: string, ts: string, extra = {}) =>
  stamp(null, { id, name: "Test Farmer 1", village: "Testpur", district: "Test District", state: "Test State",
    crops: [{ crop: "wheat", season: "rabi", area_acres: 1 }], source: "app", deleted: 0, ...extra }, ts);

async function push(s: ReturnType<typeof setup>, cookie: string, changes: Record<string, SyncRecord[]>, since = 0) {
  const r = await s.req("/api/sync", { method: "POST", body: JSON.stringify({ since, changes }) }, cookie);
  return r.json();
}

test("sync needs a signed-in field worker or admin", async () => {
  const s = setup();
  const r = await s.req("/api/sync", { method: "POST", body: JSON.stringify({ since: 0, changes: {} }) });
  assert.equal(r.status, 401);
});

test("a farmer without consent is rejected; with consent in the same push it is stored", async () => {
  const s = setup(); const cookie = await signIn(s.req); const c = phone("a");
  const r1 = await push(s, cookie, { farmer: [farmer("F-TEST-1", c.tick())] });
  assert.deepEqual(r1.rejected, [{ table: "farmer", id: "F-TEST-1", reason: "no_consent" }]);
  const r2 = await push(s, cookie, { farmer: [farmer("F-TEST-1", c.tick())], consent: [consentFor("F-TEST-1", c.tick())] });
  assert.equal(r2.accepted, 2);
  assert.deepEqual(r2.rejected, []);
  assert.deepEqual(r2.changes.farmer[0].crops, [{ crop: "wheat", season: "rabi", area_acres: 1 }]);
});

test("withdrawn consent or scope_store=0 blocks storing the farmer", async () => {
  const s = setup(); const cookie = await signIn(s.req); const c = phone("a");
  const r = await push(s, cookie, {
    consent: [consentFor("F-TEST-2", c.tick(), { scope_store: 0 }), consentFor("F-TEST-3", c.tick(), { withdrawn_at: "2026-10-19" })],
    farmer: [farmer("F-TEST-2", c.tick()), farmer("F-TEST-3", c.tick())],
  });
  assert.deepEqual(r.rejected.map((x: { reason: string }) => x.reason), ["no_consent", "no_consent"]);
});

test("two phones edit different fields of one farmer: both edits survive on the server", async () => {
  const s = setup(); const cookie = await signIn(s.req);
  const a = phone("a"), b = phone("b");
  const base = farmer("F-TEST-4", a.tick());
  await push(s, cookie, { consent: [consentFor("F-TEST-4", a.tick())], farmer: [base] });
  const onA = stamp(base, { ...base, village: "Testpur Kalan" }, a.tick());
  const onB = stamp(base, { ...base, notes: "met at Test Mandi A" }, b.tick());
  await push(s, cookie, { farmer: [onB] });
  const r = await push(s, cookie, { farmer: [onA] });
  const f = r.changes.farmer.find((x: SyncRecord) => x.id === "F-TEST-4");
  assert.equal(f.village, "Testpur Kalan");
  assert.equal(f.notes, "met at Test Mandi A");
});

test("pull returns only rows changed after the cursor", async () => {
  const s = setup(); const cookie = await signIn(s.req); const c = phone("a");
  const r1 = await push(s, cookie, { consent: [consentFor("F-TEST-5", c.tick())], farmer: [farmer("F-TEST-5", c.tick())] });
  const r2 = await push(s, cookie, {}, r1.cursor);
  assert.deepEqual(r2.changes, {});
  assert.equal(r2.cursor, r1.cursor);
  const v = stamp(null, { id: "V-TEST-1", farmer_id: "F-TEST-5", visited_on: "2026-10-19", purpose: "first visit", deleted: 0 }, c.tick());
  const r3 = await push(s, cookie, { visit: [v] }, r1.cursor);
  assert.deepEqual(Object.keys(r3.changes), ["visit"]);
});

test("bad rows are rejected with the reason, not repaired", async () => {
  const s = setup(); const cookie = await signIn(s.req); const c = phone("a");
  const r = await push(s, cookie, {
    visit: [stamp(null, { id: "V-TEST-2", farmer_id: "NOPE", visited_on: "2026-10-19" }, c.tick()),
            stamp(null, { id: "V-TEST-3", farmer_id: "NOPE", visited_on: "19/10/2026" }, c.tick())],
    mandi_price_manual: [stamp(null, { id: "M-TEST-1", market: "Test Mandi A", commodity: "Test Grain", observed_on: "2026-10-19" }, c.tick())],
    secrets: [],
  });
  assert.deepEqual(r.rejected, [
    { table: "visit", id: "V-TEST-2", reason: "unknown_farmer" },
    { table: "visit", id: "V-TEST-3", reason: "visited_on:format" },
    { table: "mandi_price_manual", id: "M-TEST-1", reason: "modal_rs_q:required" },
    { table: "secrets", id: "*", reason: "unknown_table" },
  ]);
});

test("stamps far in the future (wrong phone clock) are refused", async () => {
  const s = setup(); const cookie = await signIn(s.req);
  const future = createClock("z", () => NOW + 3 * 24 * 3600 * 1000).tick();
  const r = await push(s, cookie, { consent: [consentFor("F-TEST-6", future)] });
  assert.equal(r.rejected[0].reason, "bad_stamps");
});

test("created_by is set by the server, not the phone", async () => {
  const s = setup(); const cookie = await signIn(s.req); const c = phone("a");
  const r = await push(s, cookie, { consent: [consentFor("F-TEST-7", c.tick(), { created_by: "someone-else" })] });
  assert.notEqual(r.changes.consent[0].created_by, "someone-else");
  assert.ok(r.changes.consent[0].created_by);
});
