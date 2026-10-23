import { test } from "node:test";
import assert from "node:assert/strict";
import { wilson, curve } from "./selective.ts";
import { leafCurve, mandiScenarios } from "./run.ts";

test("wilson interval: known value and edge cases", () => {
  const [lo, hi] = wilson(52, 68);
  assert.ok(Math.abs(lo - 0.65) < 0.01 && Math.abs(hi - 0.85) < 0.01);
  assert.deepEqual(wilson(0, 0), [0, 0]);
});

test("leaf curve reproduces the committed eval: 42.8% always-answer, 76.5% at 0.6 with 28.8% coverage", () => {
  const c = leafCurve();
  assert.equal(c.points[0].accuracy, 0.428);
  const t6 = c.points.find((p) => p.threshold === 0.6)!;
  assert.equal(t6.answered, 68);
  assert.equal(t6.coverage, 0.288);
  assert.equal(t6.accuracy, 0.765);
  for (let i = 1; i < c.points.length; i++) assert.ok(c.points[i].coverage < c.points[i - 1].coverage, "coverage falls as the threshold rises");
  assert.equal(curve({ n: 10, top1: 0.5, top3: 0.9, selective: [] }).length, 1);
});

test("mandi: only a same-day fresh fetch is 'today'; failures are stale or none, never a made-up price", () => {
  assert.deepEqual(mandiScenarios().map((m) => m.shown), ["today", "older", "stale", "none", "stale"]);
});
