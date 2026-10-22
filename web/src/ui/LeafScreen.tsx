// Leaf check: crop first (region crops, then the crops it cannot check, then the rest),
// photo, then one result card with "possible" names in Hindi. Limits are shown up front.
import { useState } from "preact/hooks";
import { Icon } from "./icons.tsx";
import { Badge, Btn, ReadAloud, Screen } from "./kit.tsx";
import { getLang, t, tx } from "./i18n.ts";
import { LEAF_GROUPS, LEAF_LIMITS, cropById, isSupported, otherPlant } from "../core/leafCrops.ts";
import { LEAF_LABEL_HI } from "../core/farmView.ts";
import { leafSpeech } from "../core/speech.ts";
import { adviceFor, type Decision } from "../core/leaf.ts";
import { classifyImage } from "../data/leafModel.ts";
import { save } from "../data/db.ts";

/** Leaf label in Hindi, with the model's own label small in English. */
function LabelName({ label }: { label: string }) {
  const hi = LEAF_LABEL_HI[label];
  if (getLang() === "en" || !hi) return <span lang="en">{label}</span>;
  return <><span>{hi}</span> <span class="src-name" lang="en">{label}</span></>;
}

export function LeafLimits() {
  const L = LEAF_LIMITS;
  const outOf10 = Math.round(L.top1Pct / 10);
  return (
    <details class="card limits" open>
      <summary>{t("leafLimitsTitle")}</summary>
      <p class="limits-lead">{t("leafOutOf10").replace("{n}", String(outOf10))}</p>
      <p class="dots" role="img" aria-label={t("leafOutOf10").replace("{n}", String(outOf10))}>
        {Array.from({ length: 10 }, (_, i) => <span key={i} class={i < outOf10 ? "dot on" : "dot"} />)}
      </p>
      <ul class="small">
        <li>{tx({ en: `Exact: first guess right ${L.top1Pct}%, right answer in the top 3 ${L.top3Pct}% (${L.testImages} PlantDoc test photos).`,
                  hi: `ठीक आंकड़े: पहला अनुमान सही ${L.top1Pct}%, सही उत्तर पहले 3 में ${L.top3Pct}% (${L.testImages} PlantDoc टेस्ट फ़ोटो)।` })}</li>
        <li>{tx({ en: `It names a disease only at ${L.threshold * 100}%+ confidence: that happens for ${L.coveragePct}% of photos, and those are right ${L.accuracyWhenConfidentPct}% of the time.`,
                  hi: `${L.threshold * 100}%+ भरोसे पर ही रोग बताता है: ऐसा ${L.coveragePct}% फ़ोटो में होता है, और उनमें ${L.accuracyWhenConfidentPct}% सही होते हैं।` })}</li>
        <li>{tx({ en: "No wheat, rice, cotton, gram or soybean disease classes. Trained on web photos (PlantDoc), not tested in Indian fields.",
                  hi: "गेहूं, धान, कपास, चना और सोयाबीन के रोग इसमें नहीं हैं। वेब फ़ोटो (PlantDoc) पर सिखाया गया, भारत के खेतों में जांचा नहीं गया।" })}</li>
      </ul>
    </details>
  );
}

function CropChip({ id, crop, onPick }: { id: string; crop: string; onPick: (id: string) => void }) {
  const c = cropById(id)!;
  const ok = isSupported(id);
  return (
    <button type="button" role="radio" aria-checked={crop === id} class={`chip${crop === id ? " on" : ""}${ok ? "" : " off"}`} onClick={() => onPick(id)}>
      {!ok && <Icon name="cross" size={18} />}{tx(c)}
    </button>
  );
}

export function LeafScreen({ farmerId, back }: { farmerId?: string; back: string }) {
  const [crop, setCrop] = useState<string>("");
  const [img, setImg] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Decision | null>(null);
  const [error, setError] = useState(false);
  const [savedId, setSavedId] = useState("");
  const pick = (id: string) => { setCrop(id); setResult(null); setImg(""); };

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
  const other = result ? otherPlant(crop, result.best) : false;
  return (
    <Screen title={t("leaf")} back={back}>
      <div role="radiogroup" aria-label={t("leafPickCrop")}>
        <h2>{t("leafPickCrop")}</h2>
        <div class="chips">{LEAF_GROUPS.region.map(id => <CropChip key={id} id={id} crop={crop} onPick={pick} />)}</div>
        <h3 class="group-h">{t("leafNotChecked")}</h3>
        <div class="chips">{LEAF_GROUPS.notChecked.map(id => <CropChip key={id} id={id} crop={crop} onPick={pick} />)}</div>
        <details class="more-crops" open={LEAF_GROUPS.other.includes(crop)}>
          <summary>{t("leafOtherCrops")}</summary>
          <div class="chips">{LEAF_GROUPS.other.map(id => <CropChip key={id} id={id} crop={crop} onPick={pick} />)}</div>
        </details>
      </div>

      {crop && !supported && (
        <div class="notice warn" role="status">
          <p class="notice-title"><Icon name="cross" size={22} /> {t("leafNotSupported")}</p>
          <p>{c?.note ? tx(c.note) + " " : ""}{t("leafNotSupportedWhy")}</p>
        </div>
      )}

      {supported && (
        <>
          <label class="btn primary file">
            <Icon name="camera" size={24} />{img ? t("retake") : t("leafTakePhoto")}
            <input type="file" accept="image/*" capture="environment" onChange={onFile} class="visually-hidden" />
          </label>
          <p class="small">{t("leafFirstDownload")}</p>
          {img && <img class="leaf-photo" src={img} alt={t("leafPhotoAlt")} />}
          {busy && <p aria-live="polite">{t("leafRunning")}</p>}
          {error && <div class="notice bad" role="alert">{t("leafRuntimeError")}</div>}
          {result && (
            <section class={`card result${result.confident && !other ? "" : " unsure"}`} aria-live="polite">
              {(!result.confident || other) && (
                <p class="result-flag"><Icon name="warn" size={22} />{other ? t("leafOtherPlant") : t("leafNotSureShort")}</p>
              )}
              <h3>{t("leafPossible")}</h3>
              <ol class="guesses">
                {result.top.map((g, i) => (
                  <li key={g.label}>
                    <LabelName label={g.label} />
                    <span class="pct">{Math.round(g.prob * 100)}% {t("confidence")}</span>
                    {i === 0 && result.confident && !other && <Badge kind="ok">{t("leafLikely")}</Badge>}
                  </li>
                ))}
              </ol>
              {result.confident && !other && adviceFor(result.best.label) && <p>{tx(adviceFor(result.best.label))}</p>}
              <p>{t("kvkNote")}</p>
              <ReadAloud text={leafSpeech({ confident: result.confident && !other, topHi: result.top.map(g => LEAF_LABEL_HI[g.label] ?? g.label) })} />
              {farmerId && !savedId && <Btn kind="ghost" onClick={keep}>{t("saveToFarmer")}</Btn>}
              {savedId && <p role="status" class="ok-text"><Icon name="check" size={20} /> {t("saved")}</p>}
            </section>
          )}
        </>
      )}
      <LeafLimits />
    </Screen>
  );
}
