import { test } from "node:test";
import assert from "node:assert/strict";
import { pickHindiVoice, priceSpeech, adviceSpeech, leafSpeech } from "./speech.ts";
import { todayList } from "./today.ts";
import { exportFarmersCsv, exportJson, safeCell } from "./exporter.ts";
import { LEAF_GROUPS, LEAF_CROPS, isSupported } from "./leafCrops.ts";

test("read-aloud only with a Hindi voice on the phone", () => {
  assert.equal(pickHindiVoice([{ lang: "en-IN", name: "A" }, { lang: "en-US", name: "B" }]), null);
  assert.equal(pickHindiVoice([{ lang: "en-IN", name: "A" }, { lang: "hi-IN", name: "Lekha" }])!.name, "Lekha");
  assert.equal(pickHindiVoice([{ lang: "hi_IN", name: "Android Hindi" }])!.name, "Android Hindi");
  assert.equal(pickHindiVoice([]), null);
});

test("spoken text says the date and source; nothing is added that isn't on screen", () => {
  const s = priceSpeech({ cropHi: "प्याज़", modal: 4300, market: "Bhopal APMC", dateHi: "20 अक्टू॰", snapshot: true });
  assert.match(s, /प्याज़/);
  assert.match(s, /4300 रुपये प्रति क्विंटल/);
  assert.match(s, /20 अक्टू॰/);
  assert.match(s, /आज का भाव नहीं/);
  assert.match(adviceSpeech("आज सिंचाई की ज़रूरत नहीं", 9), /9 दिन/);
  assert.match(leafSpeech({ confident: false, topHi: ["टमाटर: स्वस्थ पत्ती"] }), /पक्का नहीं/);
  assert.match(leafSpeech({ confident: false, topHi: ["टमाटर: स्वस्थ पत्ती"] }), /KVK/);
});

test("today list: follow-ups due or overdue, recent onboardings, and what is not yet synced", () => {
  const farmers = [
    { id: "F1", name: "Test Farmer 1", onboarded_at: "2026-10-01" },
    { id: "F2", name: "Test Farmer 2", onboarded_at: "2026-10-20" },
    { id: "F3", name: "Test Farmer 3", onboarded_at: "2026-09-01" },
  ];
  const visits = [
    { id: "V1", farmer_id: "F1", visited_on: "2026-10-10", follow_up_on: "2026-10-22" },
    { id: "V3a", farmer_id: "F3", visited_on: "2026-09-10", follow_up_on: "2026-09-20" },
    { id: "V3b", farmer_id: "F3", visited_on: "2026-09-21", follow_up_on: null },      // later visit closes it
    { id: "V2", farmer_id: "F2", visited_on: "2026-10-20", follow_up_on: "2026-10-30" }, // not due yet
  ];
  const r = todayList(farmers, visits, ["farmer:F2", "visit:V1"], "2026-10-22");
  assert.deepEqual(r.due.map(d => [d.farmer.id, d.overdueDays]), [["F1", 0]]);
  assert.deepEqual(r.recent.map(f => f.id), ["F2"]);
  assert.deepEqual([...r.pending].sort(), ["F1", "F2"]);
});

test("CSV export defuses spreadsheet formulas and keeps the database column names", () => {
  assert.equal(safeCell("=HYPERLINK(\"x\")"), "'=HYPERLINK(\"x\")");
  assert.equal(safeCell("+91 9000000001"), "'+91 9000000001");
  assert.equal(safeCell("-5"), "'-5");
  assert.equal(safeCell("@cmd"), "'@cmd");
  assert.equal(safeCell("Testpur"), "Testpur");
  const csv = exportFarmersCsv([{ id: "F1", name: "=1+1", village: "Testpur", crops: [{ crop: "wheat" }], deleted: 0 }, { id: "F2", name: "", deleted: 1 }]);
  const [head, line, extra] = csv.trim().split("\n");
  assert.ok(head.startsWith("id,name,phone,village"));
  assert.ok(line.includes("'=1+1"));
  assert.ok(line.includes('"[{""crop"":""wheat""}]"'));
  assert.equal(extra, undefined, "deleted rows are not exported");
});

test("JSON export holds every table, without sync stamps or deleted rows", () => {
  const j = JSON.parse(exportJson({ farmer: [{ id: "F1", name: "Test Farmer 1", _v: { name: "t" }, deleted: 0 }, { id: "F2", deleted: 1 }], visit: [] }, "2026-10-22T10:00:00Z"));
  assert.equal(j.exported_at, "2026-10-22T10:00:00Z");
  assert.deepEqual(j.tables.farmer, [{ id: "F1", name: "Test Farmer 1", deleted: 0 }]);
  assert.deepEqual(j.tables.visit, []);
});

test("leaf crop picker: region crops first, unsupported crops in their own labelled group", () => {
  assert.deepEqual(LEAF_GROUPS.region, ["tomato", "potato", "corn", "bell_pepper"]);
  assert.deepEqual(LEAF_GROUPS.notChecked, ["wheat", "rice", "cotton", "gram", "soybean"]);
  for (const id of LEAF_GROUPS.notChecked) assert.equal(isSupported(id), false, id);
  for (const id of [...LEAF_GROUPS.region, ...LEAF_GROUPS.other]) assert.equal(isSupported(id), true, id);
  const all = [...LEAF_GROUPS.region, ...LEAF_GROUPS.notChecked, ...LEAF_GROUPS.other].sort();
  assert.deepEqual(all, LEAF_CROPS.map(c => c.id).sort(), "every crop is in exactly one group");
});
