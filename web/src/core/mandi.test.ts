import { test } from "node:test";
import assert from "node:assert/strict";
import { freshness, commoditiesIn, rowsFor, manualFor, showDate, rupees, type MandiAnswer, type MandiRow } from "./mandi.ts";

const row = (o: Partial<MandiRow>): MandiRow => ({ state: "Test State", district: "Test District", market: "Test Mandi A", commodity: "Test Grain",
  variety: "", grade: "", arrival_date: "2026-10-19", min_price: null, max_price: null, modal_price: 1000, ...o });
const ans = (o: object): MandiAnswer => ({ available: true, stale: false, source: "agmarknet", unit: "Rs./Quintal", as_of: "2026-10-19",
  fetched_at: "2026-10-19T10:00:00Z", total: 1, truncated: false, records: [row({})], ...o }) as MandiAnswer;

test("freshness: today, older report, stale snapshot, none", () => {
  assert.equal(freshness(ans({}), "2026-10-19"), "today");
  assert.equal(freshness(ans({}), "2026-10-20"), "older");
  assert.equal(freshness(ans({ stale: true }), "2026-10-19"), "stale");
  assert.equal(freshness({ available: false, reason: "no_api_key" }, "2026-10-19"), "none");
  assert.equal(freshness(null, "2026-10-19"), "none");
  assert.equal(freshness(ans({ records: [] }), "2026-10-19"), "none");
});

test("commodity picker uses the API's own names; rows sort newest first", () => {
  const rows = [row({ commodity: "Test Pulse", market: "B" }), row({ commodity: "Test Grain", arrival_date: "2026-10-18", market: "A" }), row({ market: "C" })];
  assert.deepEqual(commoditiesIn(rows), ["Test Grain", "Test Pulse"]);
  assert.deepEqual(rowsFor(rows, ["Test Grain"]).map(r => r.market), ["C", "A"]);
});

test("manual prices are filtered separately and never merged into Agmarknet rows", () => {
  const m = [{ id: "1", market: "Test Mandi A", commodity: "test grain", modal_rs_q: 900, observed_on: "2026-10-18", district: "Test District" },
             { id: "2", market: "X", commodity: "Other", modal_rs_q: 1, observed_on: "2026-10-19" }];
  assert.deepEqual(manualFor(m, ["Test Grain"], "Test District").map(x => x.id), ["1"]);
});

test("formatting", () => {
  assert.equal(showDate("2026-10-19"), "19/10/2026");
  assert.equal(showDate(null), "");
  assert.equal(rupees(215000), "₹2,15,000");
  assert.equal(rupees(null), "—");
});
