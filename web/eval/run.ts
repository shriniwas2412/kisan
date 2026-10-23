// Offline evaluation for Kisan. Run: npm run eval (writes eval/report.json and
// eval/leaf-selective.svg, prints Markdown). Numbers come from committed data:
// the leaf model's test-split results and the app's own freshness rules.
import { readFileSync, writeFileSync } from "node:fs";
import { curve, curveSvg, type EvalReport } from "./selective.ts";
import { freshness, type MandiAnswer } from "../src/core/mandi.ts";
import { snapshotAnswer, type MandiSnapshot } from "../src/core/demo.ts";

export function leafCurve() {
  const r = JSON.parse(readFileSync(new URL("../src/core/data/leaf_eval.json", import.meta.url), "utf8")) as EvalReport;
  return { n: r.n, top1: r.top1, top3: r.top3, points: curve(r) };
}

/** What the farmer sees in each cache situation (same rules as the UI). */
export function mandiScenarios(today = "2026-10-20") {
  const row = { state: "Madhya Pradesh", district: "Bhopal", market: "Test Mandi", commodity: "Wheat", variety: "Other", grade: "FAQ", arrival_date: today, min_price: 1, max_price: 3, modal_price: 2 };
  const ans = (o: Partial<Extract<MandiAnswer, { available: true }>>): MandiAnswer =>
    ({ available: true, stale: false, source: "agmarknet", unit: "Rs./Quintal", as_of: today, fetched_at: `${today}T06:00:00Z`, total: 1, truncated: false, records: [row], ...o }) as MandiAnswer;
  const snap = JSON.parse(readFileSync(new URL("../public/demo/mandi-snapshot-2026-10-20.json", import.meta.url), "utf8")) as MandiSnapshot;
  return [
    { case: "fresh fetch, report dated today", shown: freshness(ans({}), today) },
    { case: "fresh fetch, latest report older", shown: freshness(ans({ as_of: "2026-10-18" }), today) },
    { case: "upstream down, last-good cache", shown: freshness(ans({ stale: true }), today) },
    { case: "upstream down, no cache", shown: freshness({ available: false, reason: "upstream" } as MandiAnswer, today) },
    { case: "demo snapshot (no server)", shown: freshness(snapshotAnswer(snap, "Madhya Pradesh", "Bhopal").answer, today) },
  ];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const leaf = leafCurve();
  const mandi = mandiScenarios();
  writeFileSync(new URL("./report.json", import.meta.url), JSON.stringify({ source: "src/core/data/leaf_eval.json (kisan-agent training/eval_onnx.py, PlantDoc test split)", leaf, mandi }, null, 2) + "\n");
  writeFileSync(new URL("./leaf-selective.svg", import.meta.url), curveSvg(leaf.points));
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  console.log(`## Leaf model: selective prediction (PlantDoc test split, n = ${leaf.n})\n`);
  console.log("| Answer only if top probability ≥ | Photos answered | Coverage | Accuracy when answering | 95% CI |\n|---|---|---|---|---|");
  for (const p of leaf.points) console.log(`| ${p.threshold === 0 ? "always (no abstain)" : p.threshold} | ${p.answered} | ${pct(p.coverage)} | ${pct(p.accuracy)} | ${pct(p.ci95[0])}–${pct(p.ci95[1])} |`);
  console.log("\n## Mandi cache: what is shown\n\n| Situation | Badge |\n|---|---|");
  for (const m of mandi) console.log(`| ${m.case} | ${m.shown} |`);
}
