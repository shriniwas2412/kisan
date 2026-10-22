import { test } from "node:test";
import assert from "node:assert/strict";
import { pushPlan, tombstoneFields, applyRemote } from "./syncScope.ts";
import { stamp } from "../../../shared/sync.ts";

const rows: Record<string, Record<string, unknown>> = {
  "consent:C1": { id: "C1", subject_type: "farmer", subject_id: "F1", scope_store: 1, scope_sync: 1 },
  "farmer:F1": { id: "F1", name: "Test Farmer 1" },
  "visit:V1": { id: "V1", farmer_id: "F1" },
  "consent:C2": { id: "C2", subject_type: "farmer", subject_id: "F2", scope_store: 1, scope_sync: 0 },
  "farmer:F2": { id: "F2", name: "Test Farmer 2" },
  "visit:V2": { id: "V2", farmer_id: "F2" },
  "leaf_check:L2": { id: "L2", farmer_id: "F2" },
  "consent:C3": { id: "C3", subject_type: "farmer", subject_id: "F3", scope_store: 1, scope_sync: 1, withdrawn_at: "2026-10-20" },
  "farmer:F3": { id: "F3", deleted: 1, name: "" },
  "mandi_price_manual:M1": { id: "M1", market: "Test Mandi A" },
  "farmer:DEMO-F1": { id: "DEMO-F1", name: "Demo Farmer 1" },
};
const consents = Object.entries(rows).filter(([k]) => k.startsWith("consent:")).map(([, r]) => r);

test("only subjects whose consent allows sync are pushed; the rest stay on the phone", () => {
  const plan = pushPlan(Object.keys(rows), k => rows[k], consents);
  assert.deepEqual(plan.push.sort(), ["consent:C1", "consent:C3", "farmer:F1", "farmer:F3", "mandi_price_manual:M1", "visit:V1"]);
  assert.deepEqual(plan.keptLocal.sort(), ["consent:C2", "farmer:F2", "leaf_check:L2", "visit:V2"]);
  assert.ok(!plan.push.includes("farmer:DEMO-F1") && !plan.keptLocal.includes("farmer:DEMO-F1"), "demo rows are neither sent nor counted");
});

test("deleting clears the personal fields, not just a flag", () => {
  assert.deepEqual(tombstoneFields("farmer"), {
    deleted: 1, name: "", phone: null, village: null, block: null, district: null, state: null, lat: null, lng: null, land_acres: null,
    irrigation_source: null, crops: null, language: null, onboarded_at: null, source: null, source_ref: null, notes: null,
  });
  assert.equal(tombstoneFields("visit").observations, null);
  assert.equal(tombstoneFields("visit").visited_on, "");
});

test("a deleted record from the server replaces the phone's copy, personal data included", () => {
  const local = stamp(null, { id: "F1", name: "Test Farmer 1", phone: "9000000001", notes: "edited later" }, "t09:a");
  const remote = { id: "F1", deleted: 1, name: "", phone: null, notes: null, _v: { deleted: "t05:s" } };
  assert.deepEqual(applyRemote(local, remote), remote);
  const live = { id: "F1", name: "Test Farmer 1B", _v: { name: "t10:s" } };
  assert.equal(applyRemote(local, live).name, "Test Farmer 1B");
  assert.equal(applyRemote(local, live).phone, "9000000001");
});
