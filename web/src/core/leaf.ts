// Leaf photo -> PlantDoc class, using the MobileNetV3-Small ONNX model from kisan-agent.
// Preprocessing matches training eval: resize short side to 256, centre-crop 224,
// ImageNet mean/std, NCHW float32.

export const MEAN = [0.485, 0.456, 0.406];
export const STD = [0.229, 0.224, 0.225];
export const SIZE = 224;
// Threshold chosen on the PlantDoc test split; data/leaf_eval.json has the measured
// coverage and accuracy at it (checked by leaf.test.ts). Below it, we say "not sure".
export const CONFIDENT_AT = 0.6;

/** Same integer maths as the Python preprocess: resized size and crop offset. */
export function cropRect(w: number, h: number) {
  const scale = 256 / Math.min(w, h);
  const rw = Math.round(w * scale), rh = Math.round(h * scale);
  return { rw, rh, left: Math.floor((rw - SIZE) / 2), top: Math.floor((rh - SIZE) / 2) };
}

// Port of Pillow's Image.resize(..., BILINEAR) (libImaging/Resample.c): a triangle
// filter whose support grows with the downscale factor, fixed-point weights, and a
// horizontal pass rounded to uint8 before the vertical pass. The browser's canvas
// resize differs enough to change this model's answer, so we resample ourselves.
const PRECISION_BITS = 32 - 8 - 2;

function coeffs(inSize: number, outSize: number) {
  const scale = inSize / outSize;
  const filterscale = Math.max(scale, 1);
  const support = filterscale;
  const ksize = Math.ceil(support) * 2 + 1;
  const bounds = new Int32Array(outSize * 2);
  const kk = new Int32Array(outSize * ksize);
  const pre = new Float64Array(ksize);
  for (let xx = 0; xx < outSize; xx++) {
    const center = (xx + 0.5) * scale;
    const xmin = Math.max(Math.trunc(center - support + 0.5), 0);
    const xmax = Math.min(Math.trunc(center + support + 0.5), inSize) - xmin;
    let ww = 0;
    for (let x = 0; x < xmax; x++) {
      const d = Math.abs((x + xmin - center + 0.5) / filterscale);
      pre[x] = d < 1 ? 1 - d : 0;
      ww += pre[x];
    }
    for (let x = 0; x < xmax; x++) {
      const w = ww ? pre[x] / ww : 0;
      kk[xx * ksize + x] = Math.trunc(w < 0 ? -0.5 + w * (1 << PRECISION_BITS) : 0.5 + w * (1 << PRECISION_BITS));
    }
    bounds[xx * 2] = xmin;
    bounds[xx * 2 + 1] = xmax;
  }
  return { bounds, kk, ksize };
}

const clip8 = (v: number) => (v >> PRECISION_BITS) < 0 ? 0 : (v >> PRECISION_BITS) > 255 ? 255 : (v >> PRECISION_BITS);

/** rgba: Uint8ClampedArray of w*h*4. Returns RGB bytes (Uint8Array of ow*oh*3). */
export function resizeBilinear(rgba: ArrayLike<number>, w: number, h: number, ow: number, oh: number): Uint8Array {
  const H = coeffs(w, ow), V = coeffs(h, oh);
  const tmp = new Uint8Array(ow * h * 3);
  const half = 1 << (PRECISION_BITS - 1);
  for (let y = 0; y < h; y++) {
    for (let xx = 0; xx < ow; xx++) {
      const xmin = H.bounds[xx * 2], xmax = H.bounds[xx * 2 + 1], k = xx * H.ksize;
      let r = half, g = half, b = half;
      for (let x = 0; x < xmax; x++) {
        const i = (y * w + x + xmin) * 4, c = H.kk[k + x];
        r += rgba[i] * c; g += rgba[i + 1] * c; b += rgba[i + 2] * c;
      }
      const o = (y * ow + xx) * 3;
      tmp[o] = clip8(r); tmp[o + 1] = clip8(g); tmp[o + 2] = clip8(b);
    }
  }
  const out = new Uint8Array(ow * oh * 3);
  for (let yy = 0; yy < oh; yy++) {
    const ymin = V.bounds[yy * 2], ymax = V.bounds[yy * 2 + 1], k = yy * V.ksize;
    for (let xx = 0; xx < ow; xx++) {
      let r = half, g = half, b = half;
      for (let y = 0; y < ymax; y++) {
        const i = ((y + ymin) * ow + xx) * 3, c = V.kk[k + y];
        r += tmp[i] * c; g += tmp[i + 1] * c; b += tmp[i + 2] * c;
      }
      const o = (yy * ow + xx) * 3;
      out[o] = clip8(r); out[o + 1] = clip8(g); out[o + 2] = clip8(b);
    }
  }
  return out;
}

/** Full preprocessing on raw RGBA pixels: resize short side 256, centre-crop 224, normalise. */
export function preprocess(rgba: ArrayLike<number>, w: number, h: number): Float32Array {
  const r = cropRect(w, h);
  const rgb = resizeBilinear(rgba, w, h, r.rw, r.rh);
  const crop = new Uint8ClampedArray(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = ((y + r.top) * r.rw + x + r.left) * 3, o = (y * SIZE + x) * 4;
      crop[o] = rgb[i]; crop[o + 1] = rgb[i + 1]; crop[o + 2] = rgb[i + 2]; crop[o + 3] = 255;
    }
  }
  return toTensorData(crop);
}

/** RGBA bytes of a 224x224 image -> normalised NCHW Float32Array. */
export function toTensorData(rgba: ArrayLike<number>): Float32Array {
  const n = SIZE * SIZE;
  if (rgba.length !== n * 4) throw new Error(`expected ${n * 4} bytes, got ${rgba.length}`);
  const out = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 3; c++) {
      out[c * n + i] = (rgba[i * 4 + c] / 255 - MEAN[c]) / STD[c];
    }
  }
  return out;
}

export function softmax(logits: ArrayLike<number>): number[] {
  const max = Math.max(...Array.from(logits));
  const exps = Array.from(logits, x => Math.exp(x - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map(e => e / sum);
}

export type Guess = { label: string; prob: number };

export function topK(probs: number[], labels: string[], k = 3): Guess[] {
  return probs
    .map((p, i) => ({ label: labels[i], prob: p }))
    .sort((a, b) => b.prob - a.prob)
    .slice(0, k);
}

export type Decision = { confident: boolean; healthy: boolean; best: Guess; top: Guess[] };

export function decide(top: Guess[]): Decision {
  const best = top[0];
  return {
    confident: best.prob >= CONFIDENT_AT,
    healthy: !/(blight|spot|rust|scab|mildew|virus|mold|mites|rot)/i.test(best.label),
    best,
    top,
  };
}

// Short, dose-free next steps. Spray choice and dose must come from KVK / agri officer.
const ADVICE: [RegExp, { en: string; hi: string }][] = [
  [/late blight/i, { en: "Spreads fast in cool, wet weather. Remove and destroy badly hit leaves, keep foliage dry, and ask KVK for a fungicide today.", hi: "ठंडे, गीले मौसम में तेज़ फैलता है। ज़्यादा खराब पत्तियां हटाकर नष्ट करें, पत्तियों को सूखा रखें, और आज ही KVK से दवा पूछें।" }],
  [/early blight|septoria|leaf spot|gray leaf spot|bacterial spot/i, { en: "Remove spotted lower leaves, avoid overhead watering, give plants more air. Rotate crops next season. Ask KVK before spraying.", hi: "नीचे की धब्बे वाली पत्तियां हटाएं, ऊपर से पानी न दें, पौधों में हवा रखें। अगले मौसम फसल बदलें। दवा से पहले KVK से पूछें।" }],
  [/rust/i, { en: "Rust spreads by wind. Remove infected leaves early and check nearby plants. Ask KVK for a suitable spray.", hi: "रतुआ हवा से फैलता है। संक्रमित पत्तियां जल्दी हटाएं और आसपास के पौधे देखें। सही दवा के लिए KVK से पूछें।" }],
  [/virus|mosaic|yellow/i, { en: "Viruses have no cure on the plant. Pull out badly affected plants and control whitefly/aphids that carry it.", hi: "वायरस का पौधे पर इलाज नहीं है। ज़्यादा प्रभावित पौधे उखाड़ें और सफेद मक्खी/माहू को नियंत्रित करें।" }],
  [/mildew|mold|rot|scab/i, { en: "Fungal problem favoured by humidity. Improve spacing and airflow, remove affected parts, ask KVK about a spray.", hi: "नमी से बढ़ने वाला फफूंद रोग। दूरी और हवा बढ़ाएं, प्रभावित हिस्से हटाएं, दवा के लिए KVK से पूछें।" }],
  [/mites/i, { en: "Spider mites like hot, dry weather. Check leaf undersides, spray plain water on them, ask KVK if it spreads.", hi: "मकड़ी कीट गर्म, सूखे मौसम में बढ़ते हैं। पत्ती के नीचे देखें, सादा पानी छिड़कें, फैलने पर KVK से पूछें।" }],
];

export function adviceFor(label: string): { en: string; hi: string } | null {
  for (const [re, text] of ADVICE) if (re.test(label)) return text;
  return null;
}

