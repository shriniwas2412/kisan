import { test } from "node:test";
import assert from "node:assert/strict";
import { importFarmers, FARMER_COLUMNS, CONSENT_COLUMNS } from "./importFarmers.ts";

const farmersCsv = `id,name,phone,village,block,district,state,lat,lng,land_acres,irrigation_source,crops,language,onboarded_at,source,source_ref,notes
F-TEST-001,Test Farmer 1,9000000001,Testpur,Test Block,Test District,Test State,,,2.5,borewell,"[{""crop"":""wheat"",""season"":""rabi"",""area_acres"":2.5}]",hi-IN,2026-01-15,paper,notebook-TEST p.1,synthetic
F-TEST-002,Test Farmer 2,,Testpur,,Test District,Test State,,,1,,,hi-IN,2026-01-15,paper,notebook-TEST p.2,no consent row
F-TEST-003,,123,Testpur,,,,,,-4,,wheat,,15/01/2026,memory,,bad row`;
const consentCsv = `id,subject_type,subject_id,given_by,guardian_name,guardian_relation,method,scope_store,scope_sync,scope_audio_cloud,scope_contact_share,scope_research_aggregate,language,recorded_at,evidence_ref,withdrawn_at
C-TEST-001,farmer,F-TEST-001,self,,,paper_signed,1,1,0,0,0,hi-IN,2026-01-15,,
C-TEST-003,farmer,F-TEST-003,self,,,paper_signed,1,1,0,0,0,hi-IN,2026-01-15,,`;

test("columns follow the onboarding templates (same names as the database)", () => {
  assert.deepEqual(FARMER_COLUMNS, ["id", "name", "phone", "village", "block", "district", "state", "lat", "lng", "land_acres",
    "irrigation_source", "crops", "language", "onboarded_at", "source", "source_ref", "notes"]);
  assert.equal(CONSENT_COLUMNS[0], "id");
  assert.ok(CONSENT_COLUMNS.includes("scope_store"));
});

test("good row with consent is accepted; missing consent and bad values are rejected with line numbers", () => {
  const r = importFarmers(farmersCsv, consentCsv);
  assert.deepEqual(r.farmers.map(f => f.id), ["F-TEST-001"]);
  assert.equal(r.farmers[0].land_acres, 2.5);
  assert.equal(r.farmers[0].lat, null);
  assert.deepEqual(r.consents.map(c => c.id), ["C-TEST-001"]);
  assert.deepEqual(r.rejected.map(x => [x.line, x.id]), [[3, "F-TEST-002"], [4, "F-TEST-003"]]);
  assert.deepEqual(r.rejected[0].problems, [{ field: "consent", code: "missing" }]);
  const bad = r.rejected[1].problems.map(p => `${p.field}:${p.code}`).sort();
  assert.deepEqual(bad, ["crops:format", "land_acres:range", "name:required", "onboarded_at:format", "phone:format", "source:enum"]);
});

test("tab-separated paste from a spreadsheet works", () => {
  const tsv = farmersCsv.split("\n").slice(0, 2).map(l => l.replace(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/g, "\t").replace(/""/g, '"').replace(/"\[/, "[").replace(/\]"/, "]")).join("\n");
  const r = importFarmers(tsv, consentCsv);
  assert.deepEqual(r.farmers.map(f => f.id), ["F-TEST-001"]);
});

test("a consent already on the device counts; a withdrawn one does not", () => {
  const two = farmersCsv.split("\n").slice(0, 3).join("\n");
  assert.equal(importFarmers(two, "", [{ subject_type: "farmer", subject_id: "F-TEST-002", scope_store: 1 }]).farmers.length, 1);
  assert.equal(importFarmers(two, "", [{ subject_type: "farmer", subject_id: "F-TEST-002", scope_store: 1, withdrawn_at: "2026-02-01" }]).farmers.length, 0);
});
