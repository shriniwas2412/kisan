import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cropRect, toTensorData, softmax, topK, decide, adviceFor, resizeBilinear, SIZE, CONFIDENT_AT } from "./leaf.ts";
import { LABELS, LEAF_CROPS, LEAF_LIMITS, isSupported, otherPlant } from "./leafCrops.ts";

test("cropRect matches the Python integer resize and crop", () => {
  assert.deepEqual(cropRect(400, 300), { rw: 341, rh: 256, left: 58, top: 16 });
  assert.deepEqual(cropRect(490, 492), { rw: 256, rh: 257, left: 16, top: 16 });
});

test("toTensorData is NCHW with ImageNet normalisation", () => {
  const rgba = new Uint8ClampedArray(SIZE * SIZE * 4).fill(255);
  const x = toTensorData(rgba);
  assert.equal(x.length, 3 * SIZE * SIZE);
  assert.ok(Math.abs(x[0] - (1 - 0.485) / 0.229) < 1e-6);
  assert.ok(Math.abs(x[SIZE * SIZE * 2] - (1 - 0.406) / 0.225) < 1e-6);
  assert.throws(() => toTensorData(new Uint8ClampedArray(10)));
});

test("softmax sums to 1 and is stable for big logits", () => {
  const p = softmax([1000, 1001, 1002]);
  assert.ok(Math.abs(p.reduce((a, b) => a + b) - 1) < 1e-9);
  assert.ok(p[2] > p[1] && p[1] > p[0]);
});

test("abstains below 0.6 and spots healthy leaves", () => {
  const labels = ["Tomato leaf", "Tomato leaf late blight", "grape leaf"];
  const sure = decide(topK([0.1, 0.85, 0.05], labels));
  assert.equal(sure.confident, true);
  assert.equal(sure.healthy, false);
  assert.ok(adviceFor(sure.best.label)?.hi);
  const unsure = decide(topK([CONFIDENT_AT - 0.01, 0.3, 0.11], labels));
  assert.equal(unsure.confident, false);
  assert.equal(unsure.top.length, 3);
  assert.equal(decide(topK([CONFIDENT_AT, 0.3, 0.1], labels)).confident, true);
  assert.equal(adviceFor("Tomato leaf"), null);
});

test("resizeBilinear matches Pillow byte for byte (down- and upscale)", () => {
  const fx = JSON.parse(readFileSync(new URL("./pillow_resize.fixture.json", import.meta.url), "utf8"));
  const rgb = Buffer.from(fx.rgb, "base64");
  const rgba = new Uint8ClampedArray(fx.w * fx.h * 4);
  for (let i = 0; i < fx.w * fx.h; i++) rgba.set([rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2], 255], i * 4);
  assert.ok(fx.cases.length >= 2);
  for (const c of fx.cases) {
    const got = resizeBilinear(rgba, fx.w, fx.h, c.ow, c.oh);
    const want = Buffer.from(c.rgb, "base64");
    let diff = 0;
    for (let i = 0; i < want.length; i++) diff = Math.max(diff, Math.abs(got[i] - want[i]));
    assert.equal(diff, 0, `${c.ow}x${c.oh}: max pixel difference ${diff}`);
  }
});

// The measured limits shown in the UI and README come from the ONNX eval report
// (kisan-agent training/eval_onnx.py on the PlantDoc test split, n=236).
test("leaf limits: top-1 42.8%, top-3 77.1%, 76.5% accurate at 28.8% coverage when abstaining below 0.6", () => {
  assert.deepEqual(LEAF_LIMITS, {
    testImages: 236, top1Pct: 42.8, top3Pct: 77.1, threshold: 0.6, coveragePct: 28.8, accuracyWhenConfidentPct: 76.5,
  });
});

test("README states exactly the measured leaf numbers", () => {
  const readme = readFileSync(new URL("../../../README.md", import.meta.url), "utf8");
  for (const n of ["42.8%", "77.1%", "76.5%", "28.8%", "236"]) assert.ok(readme.includes(n), n);
});

test("28 PlantDoc labels; wheat, rice, cotton, gram and soybean are refused", () => {
  assert.equal(LABELS.length, 28);
  for (const id of ["wheat", "rice", "cotton", "gram", "soybean"]) assert.equal(isSupported(id), false, id);
  for (const id of ["tomato", "potato", "corn", "grape"]) assert.equal(isSupported(id), true, id);
  // every supported crop's prefix really matches a label
  for (const c of LEAF_CROPS.filter(c => c.prefix)) assert.ok(LABELS.some(l => l.startsWith(c.prefix!)), c.id);
});

test("a best guess from another plant is flagged", () => {
  assert.equal(otherPlant("tomato", { label: "grape leaf", prob: 0.7 }), true);
  assert.equal(otherPlant("tomato", { label: "Tomato leaf", prob: 0.7 }), false);
});
