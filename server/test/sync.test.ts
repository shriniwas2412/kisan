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
  // F-TEST-2: storage refused, so no consent is kept and the farmer has none. F-TEST-3: consent already withdrawn.
  assert.deepEqual(r.rejected.map((x: { table: string; reason: string }) => `${x.table}:${x.reason}`),
    ["consent:no_sync_consent", "farmer:no_consent", "farmer:withdrawn"]);
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

// ---- consent scope_sync is enforced ----
test("a farmer whose consent says no to sync is not stored on the server", async () => {
  const s = setup(); const cookie = await signIn(s.req); const c = phone("a");
  const r = await push(s, cookie, { consent: [consentFor("F-TEST-20", c.tick(), { scope_sync: 0 })], farmer: [farmer("F-TEST-20", c.tick())] });
  assert.deepEqual(r.rejected.map((x: { table: string; reason: string }) => `${x.table}:${x.reason}`), ["consent:no_sync_consent", "farmer:no_consent"]);
  assert.equal(r.accepted, 0);
  assert.equal((await s.env.DB.prepare("SELECT COUNT(*) AS n FROM farmer").first<{ n: number }>())!.n, 0);
});

// ---- withdrawal erases personal data and cannot be undone ----
const PII = ["name", "phone", "village", "block", "district", "state", "lat", "lng", "land_acres", "irrigation_source", "crops", "notes", "onboarded_at"];

async function onboardWithVisit(s: ReturnType<typeof setup>, cookie: string, c: ReturnType<typeof phone>, id: string) {
  const consent = consentFor(id, c.tick());
  const f = farmer(id, c.tick(), { phone: "9000000001", notes: "synthetic note" });
  const v = stamp(null, { id: "V-" + id, farmer_id: id, visited_on: "2026-10-19", purpose: "first visit", observations: "synthetic", deleted: 0 }, c.tick());
  await push(s, cookie, { consent: [consent], farmer: [f], visit: [v] });
  return { consent, f, v };
}

test("withdrawing consent leaves no personal data on the server or in what phones pull", async () => {
  const s = setup(); const cookie = await signIn(s.req); const c = phone("a");
  const { consent } = await onboardWithVisit(s, cookie, c, "F-TEST-21");
  const withdrawn = stamp(consent, { ...consent, withdrawn_at: "2026-10-20" }, c.tick());
  const r = await push(s, cookie, { consent: [withdrawn] });
  const f = r.changes.farmer.find((x: SyncRecord) => x.id === "F-TEST-21");
  assert.equal(f.deleted, 1);
  for (const k of PII) assert.ok(f[k] === null || f[k] === "", `${k} still holds ${JSON.stringify(f[k])}`);
  const v = r.changes.visit.find((x: SyncRecord) => x.id === "V-F-TEST-21");
  assert.equal(v.deleted, 1);
  for (const k of ["purpose", "observations", "advice_given", "follow_up_on"]) assert.equal(v[k], null, k);
  const raw = await s.env.DB.prepare("SELECT * FROM farmer WHERE id = 'F-TEST-21'").first<Record<string, unknown>>();
  assert.equal(raw!.phone, null);
  assert.ok(!JSON.stringify(raw).includes("Test Farmer"), "name is gone from the database row");
});

test("deleting a farmer (tombstone) also strips personal data on the server", async () => {
  const s = setup(); const cookie = await signIn(s.req); const c = phone("a");
  const { f } = await onboardWithVisit(s, cookie, c, "F-TEST-22");
  const r = await push(s, cookie, { farmer: [stamp(f, { ...f, deleted: 1 }, c.tick())] });
  const got = r.changes.farmer.find((x: SyncRecord) => x.id === "F-TEST-22");
  assert.equal(got.deleted, 1);
  assert.equal(got.phone, null);
  assert.equal(got.name, "");
});

test("a withdrawal cannot be undone by a stale or newer push", async () => {
  const s = setup(); const cookie = await signIn(s.req); const c = phone("a");
  const { consent, f } = await onboardWithVisit(s, cookie, c, "F-TEST-23");
  await push(s, cookie, { consent: [stamp(consent, { ...consent, withdrawn_at: "2026-10-20" }, c.tick())] });
  const undo = stamp(consent, { ...consent, withdrawn_at: null }, c.tick());
  // A phone that saw the delete and then tries to bring the farmer back (newer deleted=0 stamp).
  const revive = stamp({ ...f, deleted: 1 }, { ...f, deleted: 0, name: "Test Farmer 1" }, c.tick());
  const r = await push(s, cookie, { consent: [undo], farmer: [revive] });
  const cons = r.changes.consent.find((x: SyncRecord) => x.id === consent.id);
  assert.equal(cons.withdrawn_at, "2026-10-20");
  assert.deepEqual(r.rejected.find((x: { table: string }) => x.table === "farmer")?.reason, "withdrawn");
  const raw = await s.env.DB.prepare("SELECT name, deleted FROM farmer WHERE id = 'F-TEST-23'").first<Record<string, unknown>>();
  assert.deepEqual({ ...raw }, { name: "", deleted: 1 });
});

test("no new visit or leaf check for a deleted or withdrawn farmer", async () => {
  const s = setup(); const cookie = await signIn(s.req); const c = phone("a");
  const { consent } = await onboardWithVisit(s, cookie, c, "F-TEST-24");
  await push(s, cookie, { consent: [stamp(consent, { ...consent, withdrawn_at: "2026-10-20" }, c.tick())] });
  const r = await push(s, cookie, {
    visit: [stamp(null, { id: "V-NEW-24", farmer_id: "F-TEST-24", visited_on: "2026-10-21", deleted: 0 }, c.tick())],
    leaf_check: [stamp(null, { id: "L-NEW-24", farmer_id: "F-TEST-24", crop: "tomato", abstained: 1, checked_at: "2026-10-21", deleted: 0 }, c.tick())],
  });
  assert.deepEqual(r.rejected.map((x: { reason: string }) => x.reason), ["farmer_deleted", "farmer_deleted"]);
});
