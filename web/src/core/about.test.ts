import { test } from "node:test";
import assert from "node:assert/strict";
import { ABOUT } from "./about.ts";
import { LEAF_LIMITS } from "./leafCrops.ts";
import { SNAPSHOT_FILE } from "./demo.ts";

const text = (lang: "hi" | "en") => ABOUT.map(s => [s.title[lang], ...s.body.map(b => b[lang])].join("\n")).join("\n");

test("About states the leaf model's measured numbers from the eval report, in both languages", () => {
  for (const lang of ["hi", "en"] as const) {
    for (const n of [LEAF_LIMITS.top1Pct, LEAF_LIMITS.top3Pct, LEAF_LIMITS.coveragePct, LEAF_LIMITS.accuracyWhenConfidentPct, LEAF_LIMITS.testImages]) {
      assert.ok(text(lang).includes(String(n)), `${lang}: ${n}`);
    }
  }
});

test("About covers purpose, data leaving the phone, mandi snapshot rule, irrigation sources, and links", () => {
  const en = text("en");
  for (const s of ["not a diagnosis", "what leaves this phone", "Agmarknet", SNAPSHOT_FILE.replace("demo/", ""), "FAO-56", "IMD", "Open-Meteo", "consent"]) {
    assert.ok(en.toLowerCase().includes(s.toLowerCase()), s);
  }
  const links = ABOUT.flatMap(s => s.links ?? []).map(l => l.href);
  assert.ok(links.includes("https://github.com/shriniwas2412/kisan"));
  assert.ok(links.some(h => h.startsWith("https://www.fao.org/3/x0490e/")));
  assert.ok(links.some(h => h.includes("data.gov.in")));
});
