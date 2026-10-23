// Selective prediction for the leaf model: if the app only answers when the top
// probability is at least t, how often does it answer (coverage) and how often is
// that answer right? Source numbers: src/core/data/leaf_eval.json, produced by
// kisan-agent training/eval_onnx.py on the PlantDoc test split (n = 236 images).
// Nothing here re-runs the model; it turns those counts into a curve with
// 95% Wilson intervals, which matter because the confident subsets are small.

export interface EvalReport { n: number; top1: number; top3: number; selective: { threshold: number; coverage: number; accuracy_when_confident: number }[] }

export function wilson(k: number, n: number, z = 1.96): [number, number] {
  if (!n) return [0, 0];
  const p = k / n, d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n), m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [(c - m) / d, (c + m) / d];
}

export interface CurvePoint { threshold: number; answered: number; correct: number; coverage: number; accuracy: number; ci95: [number, number]; risk: number }

const r3 = (x: number) => Math.round(x * 1000) / 1000;

/** Threshold 0 (always answer) plus each measured threshold; counts are rounded back to whole images. */
export function curve(r: EvalReport): CurvePoint[] {
  const pts = [{ threshold: 0, coverage: 1, accuracy_when_confident: r.top1 }, ...r.selective];
  return pts.map((s) => {
    const answered = Math.round(s.coverage * r.n);
    const correct = Math.round(s.accuracy_when_confident * answered);
    const acc = answered ? correct / answered : 0;
    const [lo, hi] = wilson(correct, answered);
    return { threshold: s.threshold, answered, correct, coverage: r3(answered / r.n), accuracy: r3(acc), ci95: [r3(lo), r3(hi)], risk: r3(1 - acc) };
  });
}

/** A small self-contained SVG: accuracy (with 95% CI bars) against coverage. */
export function curveSvg(points: CurvePoint[]): string {
  const W = 520, H = 320, L = 56, B = 44, T = 20, R = 20;
  const x = (c: number) => L + c * (W - L - R), y = (a: number) => H - B - a * (H - B - T);
  const line = points.map((p) => `${x(p.coverage).toFixed(1)},${y(p.accuracy).toFixed(1)}`).join(" ");
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="sans-serif" font-size="12" role="img" aria-label="Leaf model accuracy versus coverage">
<rect width="${W}" height="${H}" fill="#fff"/>
${ticks.map((t) => `<line x1="${x(0)}" x2="${x(1)}" y1="${y(t)}" y2="${y(t)}" stroke="#e5e5e5"/><text x="${L - 8}" y="${y(t) + 4}" text-anchor="end" fill="#444">${t * 100}%</text><text x="${x(t)}" y="${H - B + 18}" text-anchor="middle" fill="#444">${t * 100}%</text>`).join("\n")}
<text x="${(L + W - R) / 2}" y="${H - 6}" text-anchor="middle" fill="#222">coverage (share of photos the app answers)</text>
<text x="14" y="${(T + H - B) / 2}" text-anchor="middle" fill="#222" transform="rotate(-90 14 ${(T + H - B) / 2})">accuracy when answering</text>
${points.map((p) => `<line x1="${x(p.coverage)}" x2="${x(p.coverage)}" y1="${y(p.ci95[0])}" y2="${y(p.ci95[1])}" stroke="#2f6f5e" stroke-width="2"/>`).join("\n")}
<polyline points="${line}" fill="none" stroke="#2f6f5e" stroke-width="2.5"/>
${points.map((p) => `<circle cx="${x(p.coverage)}" cy="${y(p.accuracy)}" r="4.5" fill="#2f6f5e"/><text x="${x(p.coverage) + 7}" y="${y(p.accuracy) - 7}" fill="#222">t=${p.threshold}</text>`).join("\n")}
</svg>
`;
}
