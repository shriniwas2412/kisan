import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setup } from "./helpers.ts";
import { buildUrl, isoDate, parsePage, asOf } from "../src/lib/agmarknet.ts";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/agmarknet_synthetic.json", import.meta.url), "utf8"));
const ok = async () => new Response(JSON.stringify(fixture), { status: 200 });
const down = async () => new Response("bad gateway", { status: 502 });
const Q = "/api/mandi?state=Test%20State&district=Test%20District&commodity=Test%20Grain";

test("upstream URL uses filters[state.keyword] and the other filters", () => {
  const u = new URL(buildUrl("KEY", { state: "Madhya Pradesh", district: "Bhopal", commodity: "Maize" }, 10));
  assert.equal(u.searchParams.get("filters[state.keyword]"), "Madhya Pradesh");
  assert.equal(u.searchParams.get("filters[district]"), "Bhopal");
  assert.equal(u.searchParams.get("filters[commodity]"), "Maize");
  assert.equal(u.searchParams.get("format"), "json");
  assert.equal(u.searchParams.get("limit"), "10");
  assert.equal(u.searchParams.get("offset"), "0");
});

test("dates dd/mm/yyyy become ISO; bad dates are rejected", () => {
  assert.equal(isoDate("19/10/2026"), "2026-10-19");
  assert.equal(isoDate("31/02/2026"), null);
  assert.equal(isoDate("2026-10-19"), null);
});

test("parsing keeps real rows, drops zero/missing prices and bad dates, never fills values", () => {
  const p = parsePage(fixture);
  assert.equal(p.records.length, 2);
  assert.equal(p.dropped, 2);
  assert.equal(p.records[1].modal_price, 1000); // string "1000" parsed
  assert.equal(p.total, 12);
  assert.equal(asOf(p.records), "2026-10-19");
  assert.throws(() => parsePage({ message: "Invalid key" }));
});

test("no key and no cache -> available:false, no network call", async () => {
  const s = setup();
  const r = await (await s.req(Q)).json();
  assert.deepEqual(r, { available: false, reason: "no_api_key" });
  assert.equal(s.calls.length, 0);
});

test("state is required", async () => {
  assert.equal((await setup().req("/api/mandi")).status, 400);
});

test("fresh fetch is cached for 6 h, then refetched", async () => {
  const s = setup({ key: "TESTKEY", fetch: ok });
  const a = await (await s.req(Q)).json();
  assert.equal(a.available, true);
  assert.equal(a.stale, false);
  assert.equal(a.as_of, "2026-10-19");
  assert.equal(a.unit, "Rs./Quintal");
  assert.equal(a.truncated, true); // total 12 > 2 rows returned
  assert.equal(s.calls.length, 1);
  s.clock.set("2026-10-19T15:59:00Z");
  await s.req(Q);
  assert.equal(s.calls.length, 1, "served from cache inside 6 h");
  s.clock.set("2026-10-19T16:01:00Z");
  await s.req(Q);
  assert.equal(s.calls.length, 2, "refetched after 6 h");
});

test("upstream failure serves last-good snapshot marked stale with its date", async () => {
  let up = true;
  const s = setup({ key: "TESTKEY", fetch: async () => (up ? ok() : down()) });
  await s.req(Q);
  up = false;
  s.clock.set("2026-10-20T12:00:00Z");
  const r = await (await s.req(Q)).json();
  assert.equal(r.available, true);
  assert.equal(r.stale, true);
  assert.equal(r.as_of, "2026-10-19");
  assert.equal(r.fetched_at, "2026-10-19T10:00:00.000Z");
  assert.deepEqual(r.records.map((x: { modal_price: number }) => x.modal_price), [1100, 1000]);
});

test("upstream failure with no cache -> available:false (no price made up)", async () => {
  const s = setup({ key: "TESTKEY", fetch: down });
  assert.deepEqual(await (await s.req(Q)).json(), { available: false, reason: "upstream_error" });
  const t = setup({ key: "TESTKEY", fetch: async () => { throw new Error("timeout"); } });
  assert.deepEqual(await (await t.req(Q)).json(), { available: false, reason: "upstream_error" });
});

test("an empty answer is not cached over a good one", async () => {
  let empty = false;
  const s = setup({ key: "TESTKEY", fetch: async () => new Response(JSON.stringify(empty ? { ...fixture, total: 0, records: [] } : fixture)) });
  await s.req(Q);
  empty = true;
  s.clock.set("2026-10-20T12:00:00Z");
  const r = await (await s.req(Q)).json();
  assert.equal(r.stale, true);
  assert.equal(r.records.length, 2);
  const fresh = setup({ key: "TESTKEY", fetch: async () => new Response(JSON.stringify({ ...fixture, records: [] })) });
  assert.deepEqual(await (await fresh.req(Q)).json(), { available: false, reason: "no_records" });
});

test("the API key never appears in a response", async () => {
  const s = setup({ key: "SECRETKEY123", fetch: ok });
  const text = await (await s.req(Q)).text();
  assert.ok(!text.includes("SECRETKEY123"));
});
