import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const readme = readFileSync(new URL("../../../README.md", import.meta.url), "utf8");
const workflow = readFileSync(new URL("../../../.github/workflows/pages.yml", import.meta.url), "utf8");

test("README links the real Pages URL, which matches the workflow's base path", () => {
  assert.ok(readme.includes("https://shriniwas2412.github.io/kisan/"));
  assert.ok(!/LIVE_DEMO_LINK|<your-github-username>/.test(readme));
  assert.match(workflow, /VITE_BASE: \/\$\{\{ github\.event\.repository\.name \}\}\//);
});

test("README describes the useful-rain rule as the app's own, matching the code", async () => {
  const { effectiveRain } = await import("./irrigation.ts");
  assert.equal(effectiveRain(10), 8);
  assert.equal(effectiveRain(2), 0);
  assert.ok(readme.includes("0.8 × the day's rain when it is above 2 mm"));
  assert.ok(readme.includes("not** an FAO-56 method"));
});
