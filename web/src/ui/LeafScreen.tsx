import { useState } from "preact/hooks";
import { Badge, Btn, Notice, Screen } from "./kit.tsx";
import { t, tx } from "./i18n.ts";
import { LEAF_CROPS, LEAF_LIMITS, cropById, isSupported, otherPlant } from "../core/leafCrops.ts";
import { adviceFor, type Decision } from "../core/leaf.ts";
import { classifyImage } from "../data/leafModel.ts";
import { save } from "../data/db.ts";

export function LeafLimits() {
  const L = LEAF_LIMITS;
  return (
    <details class="card limits" open>
      <summary>{t("leafLimitsTitle")}</summary>
      <ul>
        <li>{tx({ en: `Right first guess: ${L.top1Pct}%. Right answer in top 3: ${L.top3Pct}% (${L.testImages} PlantDoc test photos).`,
                  hi: `पहला अनुमान सही: ${L.top1Pct}%। सही उत्तर पहले 3 में: ${L.top3Pct}% (${L.testImages} PlantDoc टेस्ट फ़ोटो)।` })}</li>
        <li>{tx({ en: `It names a disease only at ${L.threshold * 100}%+ confidence: that happens for ${L.coveragePct}% of photos, and those are right ${L.accuracyWhenConfidentPct}% of the time.`,
                  hi: `${L.threshold * 100}%+ भरोसे पर ही रोग बताता है: ऐसा ${L.coveragePct}% फ़ोटो में होता है, और उनमें ${L.accuracyWhenConfidentPct}% सही होते हैं।` })}</li>
        <li>{tx({ en: "No wheat, rice, cotton, gram or soybean disease classes. Trained on web photos (PlantDoc), not tested in MP fields.",
                  hi: "गेहूं, धान, कपास, चना और सोयाबीन के रोग इसमें नहीं हैं। वेब फ़ोटो (PlantDoc) पर सिखाया गया, म.प्र. के खेतों में जांचा नहीं गया।" })}</li>
      </ul>
    </details>
  );
}

export function LeafScreen({ farmerId, back }: { farmerId?: string; back: string }) {
  const [crop, setCrop] = useState<string>("");
  const [img, setImg] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Decision | null>(null);
  const [error, setError] = useState(false);
  const [savedId, setSavedId] = useState("");

  async function onFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setImg(url); setResult(null); setError(false); setBusy(true); setSavedId("");
    try {
      const el = new Image();
      el.src = url;
      await el.decode();
      setResult(await classifyImage(el));
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  async function keep() {
    if (!result || !farmerId) return;
    const r = await save("leaf_check", {
      farmer_id: farmerId, crop, abstained: result.confident ? 0 : 1, checked_at: new Date().toISOString(),
      top3: result.top.map(g => ({ label: g.label, prob: Math.round(g.prob * 1000) / 1000 })),
    });
    setSavedId(r.id);
  }

  const c = cropById(crop);
  const supported = crop && isSupported(crop);
  return (
    <Screen title={t("leaf")} back={back}>
      <h2>{t("leafPickCrop")}</h2>
      <div class="chips" role="radiogroup" aria-label={t("leafPickCrop")}>
        {LEAF_CROPS.map(x => (
          <button type="button" key={x.id} role="radio" aria-checked={crop === x.id}
            class={`chip${crop === x.id ? " on" : ""}${isSupported(x.id) ? "" : " off"}`}
            onClick={() => { setCrop(x.id); setResult(null); setImg(""); }}>
            {tx(x)}
          </button>
        ))}
      </div>

      {crop && !supported && (
        <Notice kind="warn" title={t("leafNotSupported")}>
          <p>{c?.note ? tx(c.note) + " " : ""}{t("leafNotSupportedWhy")}</p>
        </Notice>
      )}

      {supported && (
        <>
          <label class="btn primary file">
            📷 {img ? t("retake") : t("leafTakePhoto")}
            <input type="file" accept="image/*" capture="environment" onChange={onFile} class="visually-hidden" />
          </label>
          {img && <img class="leaf-photo" src={img} alt="" />}
          {busy && <p aria-live="polite">{t("leafRunning")}</p>}
          {error && <Notice kind="bad">{t("leafRuntimeError")}</Notice>}
          {result && (
            <section class="card" aria-live="polite">
              {!result.confident && <Notice kind="warn" title={t("leafNotSure")}><p>{t("leafNotSureWhy")}</p></Notice>}
              {otherPlant(crop, result.best) && <Notice kind="warn">{t("leafOtherPlant")}</Notice>}
              <h3>{t("leafPossible")}</h3>
              <ol class="guesses">
                {result.top.map((g, i) => (
                  <li key={g.label}>
                    <span>{g.label}</span>
                    <span class="pct">{Math.round(g.prob * 100)}% {t("confidence")}</span>
                    {i === 0 && result.confident && <Badge kind="ok">{t("leafLikely")}</Badge>}
                  </li>
                ))}
              </ol>
              {result.confident && adviceFor(result.best.label) && <p>{tx(adviceFor(result.best.label))}</p>}
              <Notice kind="info">{t("kvkNote")}</Notice>
              {farmerId && !savedId && <Btn kind="ghost" onClick={keep}>{t("saveToFarmer")}</Btn>}
              {savedId && <p role="status">✓ {t("saved")}</p>}
            </section>
          )}
        </>
      )}
      <LeafLimits />
    </Screen>
  );
}
