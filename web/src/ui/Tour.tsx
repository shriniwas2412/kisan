// Guided demo tour: seven short steps (about 80 s) that open the real screens one
// after another. Auto-advances, pauses on hover or any button, Esc closes. Demo only.
import { useEffect, useState } from "preact/hooks";
import { useLang } from "./i18n.ts";

export const TOUR_STEP_MS = 12_000;

export const TOUR: { path: string; hi: [string, string]; en: [string, string] }[] = [
  { path: "/farmer", hi: ["किसान का होम", "किसान की फ़सल का भाव, एक ही Agmarknet पंक्ति से, और आज खेत में क्या करें।"], en: ["Farmer home", "The farmer's own crop price from one Agmarknet row, and what to do in the field today."] },
  { path: "/farmer/mandi", hi: ["मंडी भाव", "असली पर पुराना स्नैपशॉट, स्रोत और तारीख़ के साथ। कोई भाव गढ़ा नहीं जाता।"], en: ["Mandi prices", "A real but old snapshot, labelled with its source and date. No price is ever made up."] },
  { path: "/farmer/leaf", hi: ["पत्ती जांच", "मॉडल तब ही जवाब देता है जब भरोसा 0.6 से ऊपर हो; गेहूं, धान, कपास इसमें नहीं हैं।"], en: ["Leaf check", "The model answers only above 0.6 confidence; wheat, rice and cotton are not covered."] },
  { path: "/farmer/irrigation", hi: ["सिंचाई", "FAO-56 और Open-Meteo मौसम से, एक सीधी सलाह।"], en: ["Irrigation", "FAO-56 with Open-Meteo weather, turned into one plain sentence."] },
  { path: "/fw", hi: ["फ़ील्ड वर्कर का दिन", "48 बनावटी किसान: आज के और छूटे फ़ॉलो-अप सबसे ऊपर।"], en: ["A field worker's day", "48 synthetic farmers: follow-ups due today and overdue come first."] },
  { path: "/fw/farmer/DEMO-F1", hi: ["किसान का रिकॉर्ड", "सहमति दर्ज, मुलाकातें, पत्ती जांच; सहमति वापस लेने पर निजी जानकारी मिटती है।"], en: ["A farmer record", "Consent on file, visits and leaf checks; withdrawing consent erases personal data."] },
  { path: "/fw/new", hi: ["नया किसान", "पहले सहमति, फिर जानकारी। बिना सहमति कुछ सहेजा नहीं जाता।"], en: ["Onboarding", "Consent first, then details. Nothing is saved without consent."] },
];

export function Tour({ onClose }: { onClose(): void }) {
  const lang = useLang();
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const n = TOUR.length;
  useEffect(() => {
    location.hash = TOUR[i].path;
    if (paused || i >= n - 1) return;
    const id = setTimeout(() => setI(i + 1), TOUR_STEP_MS);
    return () => clearTimeout(id);
  }, [i, paused]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, []);
  const [title, body] = TOUR[i][lang];
  const go = (j: number) => { setPaused(true); setI(j); };
  return (
    <div class="tour" role="dialog" aria-modal="false" aria-labelledby="tour-h" onPointerEnter={() => setPaused(true)}>
      <p class="small">Demo / नमूना · {i + 1}/{n}</p>
      <h2 id="tour-h">{title}</h2>
      <p>{body}</p>
      <div class="tour-bar" aria-hidden="true"><span style={{ width: `${((i + 1) / n) * 100}%` }} /></div>
      <div class="row">
        <button type="button" class="btn ghost" disabled={i === 0} onClick={() => go(i - 1)}>{lang === "hi" ? "पीछे" : "Back"}</button>
        {i < n - 1
          ? <button type="button" class="btn primary" onClick={() => go(i + 1)}>{lang === "hi" ? "आगे" : "Next"}</button>
          : <button type="button" class="btn primary" onClick={onClose}>{lang === "hi" ? "हो गया" : "Done"}</button>}
      </div>
    </div>
  );
}
