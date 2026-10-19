// Lazy-loads onnxruntime-web (WASM) and the leaf model only when a check is run.
// The runtime comes from a pinned CDN build; the service worker keeps a copy for offline use.
import { decide, preprocess, softmax, topK, SIZE, type Decision } from "../core/leaf.ts";
import { LABELS } from "../core/leafCrops.ts";

const ORT = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/";
type Ort = {
  env: { wasm: { wasmPaths: string; numThreads: number } };
  Tensor: new (type: string, data: Float32Array, dims: number[]) => unknown;
  InferenceSession: { create(url: string, o: object): Promise<Session> };
};
type Session = { inputNames: string[]; outputNames: string[]; run(feeds: Record<string, unknown>): Promise<Record<string, { data: Float32Array }>> };

let sessionP: Promise<{ ort: Ort; session: Session }> | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((ok, fail) => {
    const s = document.createElement("script");
    s.src = src; s.crossOrigin = "anonymous"; s.onload = () => ok(); s.onerror = () => fail(new Error("runtime download failed"));
    document.head.append(s);
  });
}

function load() {
  sessionP ??= (async () => {
    await loadScript(ORT + "ort.wasm.min.js");
    const ort = (window as unknown as { ort: Ort }).ort;
    ort.env.wasm.wasmPaths = ORT;
    ort.env.wasm.numThreads = 1; // no cross-origin isolation on static hosting
    const session = await ort.InferenceSession.create(`${import.meta.env.BASE_URL}model/leaf_classifier.onnx`, { executionProviders: ["wasm"] });
    return { ort, session };
  })().catch(e => { sessionP = null; throw e; });
  return sessionP;
}

export async function classifyImage(img: HTMLImageElement): Promise<Decision> {
  const { ort, session } = await load();
  let w = img.naturalWidth, h = img.naturalHeight;
  // Phone photos can be 12+ MP; shrink to <= 1024 px first (the final 256 resize is Pillow-exact).
  const shrink = Math.min(1, 1024 / Math.max(w, h));
  w = Math.round(w * shrink); h = Math.round(h * shrink);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, w, h);
  const input = new ort.Tensor("float32", preprocess(ctx.getImageData(0, 0, w, h).data, w, h), [1, 3, SIZE, SIZE]);
  const out = await session.run({ [session.inputNames[0]]: input });
  return decide(topK(softmax(out[session.outputNames[0]].data), LABELS, 3));
}
