import { test } from "node:test";
import assert from "node:assert/strict";
import { checkRow, consentAllowsStore, TABLE_NAMES } from "./schema.ts";
import { readFileSync } from "node:fs";

test("table list matches the migration", () => {
  const sql = readFileSync(new URL("../server/migrations/0001_init.sql", import.meta.url), "utf8");
  for (const t of TABLE_NAMES) assert.match(sql, new RegExp(`CREATE TABLE ${t} \\(`));
});

test("every schema column exists in the migration", async () => {
  const { columnsOf } = await import("./schema.ts");
  const sql = readFileSync(new URL("../server/migrations/0001_init.sql", import.meta.url), "utf8");
  for (const t of TABLE_NAMES) {
    const body = sql.split(`CREATE TABLE ${t} (`)[1].split(");")[0];
    for (const c of Object.keys(columnsOf(t))) assert.match(body, new RegExp(`\\b${c}\\b`), `${t}.${c}`);
  }
});

test("a synthetic farmer row from CSV strings is coerced, empty cells stay null", () => {
  const { row, problems } = checkRow("farmer", {
    id: "F-TEST-001", name: "Test Farmer 1", village: "Testpur", phone: "9000000001", lat: "", land_acres: "2.5",
    crops: '[{"crop":"wheat","season":"rabi","area_acres":2.5}]', onboarded_at: "2026-01-15", source: "paper", extra: "dropped",
  });
  assert.deepEqual(problems, []);
  assert.equal(row.land_acres, 2.5);
  assert.equal(row.lat, null);
  assert.equal(row.block, null);
  assert.deepEqual(row.crops, [{ crop: "wheat", season: "rabi", area_acres: 2.5 }]);
  assert.ok(!("extra" in row));
});

test("bad values are reported, not fixed", () => {
  const { problems } = checkRow("farmer", { id: "x", name: "", phone: "12", land_acres: "-1", source: "guess", onboarded_at: "15/01/2026", crops: "wheat" });
  const codes = Object.fromEntries(problems.map(p => [p.field, p.code]));
  assert.deepEqual(codes, { name: "required", phone: "format", land_acres: "range", source: "enum", onboarded_at: "format", crops: "format" });
});

test("visit needs farmer and date; manual price needs market, commodity, modal and date", () => {
  assert.deepEqual(checkRow("visit", { id: "v1" }).problems.map(p => p.field), ["farmer_id", "visited_on"]);
  assert.deepEqual(checkRow("mandi_price_manual", { id: "m1", modal_rs_q: "abc" }).problems.map(p => p.field).sort(),
    ["commodity", "market", "modal_rs_q", "observed_on"]);
});

test("consent allows storing only with scope_store=1 and not withdrawn", () => {
  assert.equal(consentAllowsStore({ scope_store: 1 }), true);
  assert.equal(consentAllowsStore({ scope_store: "1", withdrawn_at: "" }), true);
  assert.equal(consentAllowsStore({ scope_store: 0 }), false);
  assert.equal(consentAllowsStore({ scope_store: 1, withdrawn_at: "2026-02-01" }), false);
  assert.equal(consentAllowsStore(null), false);
});
