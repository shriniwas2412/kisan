// Which crops the leaf model knows. It was trained on PlantDoc (28 classes). Crops it
// has no disease classes for are refused before the model runs.
import labels from "../../public/model/labels.json" with { type: "json" };
import evalReport from "./data/leaf_eval.json" with { type: "json" };
import { CONFIDENT_AT, type Guess } from "./leaf.ts";

export const LABELS: string[] = labels;

export type LeafCrop = { id: string; en: string; hi: string; prefix?: string; note?: { en: string; hi: string } };

/** Crops in the picker. `prefix` matches the PlantDoc label; no prefix = not supported. */
export const LEAF_CROPS: LeafCrop[] = [
  { id: "tomato", en: "Tomato", hi: "टमाटर", prefix: "Tomato" },
  { id: "potato", en: "Potato", hi: "आलू", prefix: "Potato" },
  { id: "corn", en: "Maize (corn)", hi: "मक्का", prefix: "Corn" },
  { id: "bell_pepper", en: "Capsicum (bell pepper)", hi: "शिमला मिर्च", prefix: "Bell_pepper" },
  { id: "grape", en: "Grape", hi: "अंगूर", prefix: "grape" },
  { id: "apple", en: "Apple", hi: "सेब", prefix: "Apple" },
  { id: "squash", en: "Squash", hi: "कद्दू (स्क्वैश)", prefix: "Squash" },
  { id: "strawberry", en: "Strawberry", hi: "स्ट्रॉबेरी", prefix: "Strawberry" },
  { id: "peach", en: "Peach", hi: "आड़ू", prefix: "Peach" },
  { id: "cherry", en: "Cherry", hi: "चेरी", prefix: "Cherry" },
  { id: "blueberry", en: "Blueberry", hi: "ब्लूबेरी", prefix: "Blueberry" },
  { id: "raspberry", en: "Raspberry", hi: "रसभरी", prefix: "Raspberry" },
  { id: "wheat", en: "Wheat", hi: "गेहूं" },
  { id: "rice", en: "Rice (paddy)", hi: "धान" },
  { id: "cotton", en: "Cotton", hi: "कपास" },
  { id: "gram", en: "Gram (chana)", hi: "चना" },
  { id: "soybean", en: "Soybean", hi: "सोयाबीन",
    note: { en: "The model only knows a healthy soybean leaf. It has no soybean disease classes.",
            hi: "मॉडल केवल स्वस्थ सोयाबीन पत्ती पहचानता है। इसमें सोयाबीन के रोग नहीं हैं।" } },
];

/** Picker groups: the region's crops first, then crops the model cannot check, then the rest. */
export const LEAF_GROUPS = {
  region: ["tomato", "potato", "corn", "bell_pepper"],
  notChecked: ["wheat", "rice", "cotton", "gram", "soybean"],
  other: ["apple", "grape", "peach", "cherry", "strawberry", "blueberry", "raspberry", "squash"],
};

export function cropById(id: string): LeafCrop | undefined {
  return LEAF_CROPS.find(c => c.id === id);
}

/** Model runs only for crops that have classes in the label list. */
export function isSupported(id: string): boolean {
  const c = cropById(id);
  return !!c?.prefix && LABELS.some(l => l.startsWith(c.prefix!));
}

/** True when the model's best guess is a different plant than the one picked. */
export function otherPlant(cropId: string, best: Guess): boolean {
  const c = cropById(cropId);
  return !!c?.prefix && !best.label.startsWith(c.prefix);
}

const sel = evalReport.selective.find(s => s.threshold === CONFIDENT_AT)!;
const pct = (x: number) => Math.round(x * 1000) / 10;

/** Measured numbers shown in the UI. They come from the eval file, not typed by hand. */
export const LEAF_LIMITS = {
  testImages: evalReport.n,
  top1Pct: pct(evalReport.top1),
  top3Pct: pct(evalReport.top3),
  threshold: CONFIDENT_AT,
  coveragePct: pct(sel.coverage),
  accuracyWhenConfidentPct: pct(sel.accuracy_when_confident),
};
