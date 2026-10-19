import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, csvToObjects, toCsv } from "./csv.ts";

test("parses quotes, escaped quotes and newlines inside quotes", () => {
  const rows = parseCsv('a,b\n"x, y","he said ""hi"""\n"multi\nline",z\n');
  assert.deepEqual(rows, [["a", "b"], ["x, y", 'he said "hi"'], ["multi\nline", "z"]]);
});

test("handles CRLF, BOM and blank lines", () => {
  assert.deepEqual(parseCsv("﻿a,b\r\n\r\n1,2\r\n"), [["a", "b"], ["1", "2"]]);
});

test("header keys are trimmed and lower-cased", () => {
  assert.deepEqual(csvToObjects(" Name ,District\nTest Farmer 1,Test District"), [{ name: "Test Farmer 1", district: "Test District" }]);
});

test("round trip through toCsv", () => {
  const objs = [{ a: 'x,"y"', b: "line\nbreak" }, { a: "", b: 3 }];
  const back = csvToObjects(toCsv(["a", "b"], objs));
  assert.deepEqual(back, [{ a: 'x,"y"', b: "line\nbreak" }, { a: "", b: "3" }]);
});

test("tableToObjects reads pasted spreadsheet rows with or without a header", async () => {
  const { tableToObjects } = await import("./csv.ts");
  const cols = ["name", "village", "district"];
  assert.deepEqual(tableToObjects("name\tdistrict\nTest Farmer 1\tTest District\n", cols), [{ name: "Test Farmer 1", district: "Test District" }]);
  assert.deepEqual(tableToObjects("Test Farmer 1\tTestpur\tTest District\nTest Farmer 2\t\tTest District 2\n", cols),
    [{ name: "Test Farmer 1", village: "Testpur", district: "Test District" }, { name: "Test Farmer 2", village: "", district: "Test District 2" }]);
  assert.deepEqual(tableToObjects('Test Farmer 1,"Testpur, tehsil",Test District', cols), [{ name: "Test Farmer 1", village: "Testpur, tehsil", district: "Test District" }]);
});
