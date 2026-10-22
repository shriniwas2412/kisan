// Weather in words (today / tomorrow, rain by IMD category) and irrigation advice as one
// plain sentence. The FAO-56 numbers stay one tap away ("how it was worked out").
import { useEffect, useRef, useState } from "preact/hooks";
import { Icon } from "./icons.tsx";
import { Btn, Field, Notice, ReadAloud, Screen, Select, tk } from "./kit.tsx";
import { getLang, t, tx } from "./i18n.ts";
import { PLACES, placeById } from "../core/places.ts";
import { advise, CROPS, SOILS, type Day, type Stage } from "../core/irrigation.ts";
import { adviceLine, dayLabel, rainWords, shortDate, wateredChoices } from "../core/farmView.ts";
import { adviceSpeech } from "../core/speech.ts";
import { getWeather, type Fetched } from "../data/api.ts";

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

export type IrrPrefs = { crop: string; soil: string; stage: Stage; lastWatered: string; areaAcres: string };
export const DEFAULT_IRR: IrrPrefs = { crop: "wheat", soil: "clay", stage: "mid", lastWatered: "", areaAcres: "1" };

export function useWeather(placeId: string) {
  const [w, setW] = useState<Fetched<Day[]> | null | undefined>(undefined);
  useEffect(() => {
    const p = placeById(placeId);
    setW(undefined);
    if (p) getWeather(p.lat, p.lon).then(setW);
  }, [placeId]);
  return w;
}

/** Four days, labelled आज / कल / weekday, with rain in words. ET₀ only for field workers. */
export function DayStrip({ days, showEt0 }: { days: Day[]; showEt0: boolean }) {
  const now = today(), lang = getLang();
  return (
    <ul class="days">
      {days.map(d => (
        <li key={d.date} class={`day rain-${rainWords(d.rain)}`}>
          <b>{dayLabel(d.date, now, lang)}</b>
          <span class="with-icon"><Icon name="rain" size={22} />{tk(`rain_${rainWords(d.rain)}`)}</span>
          {d.rain > 0 && <span class="small">{d.rain.toFixed(1)} {t("mm")}</span>}
          {d.tmax != null && <span class="with-icon"><Icon name="temp" size={22} />{Math.round(d.tmax)}°C</span>}
          {showEt0 && <span class="small">ET₀ {d.et0.toFixed(1)}</span>}
        </li>
      ))}
    </ul>
  );
}

export function WeatherScreen({ placeId, pickPlace, back, worker = false }: { placeId?: string; pickPlace: boolean; back: string; worker?: boolean }) {
  const [pid, setPid] = useState(placeId ?? PLACES[0].id);
  const w = useWeather(pid);
  const days = w?.value.filter(d => d.date >= today()).slice(0, 4) ?? [];
  return (
    <Screen title={t("weather")} back={back}>
      {pickPlace ? <Select label={t("place")} value={pid} onChange={setPid} options={PLACES.map(p => ({ value: p.id, label: tx(p) }))} />
        : <p class="lead">{tx(placeById(pid))}</p>}
      {w === undefined && <p aria-live="polite">{t("weatherLoading")}</p>}
      {w === null && <Notice kind="warn" title={t("weatherNone")} />}
      {w && (
        <>
          {w.offline && <Notice kind="warn">{t("offline")} · {t("savedAt")} {shortDate(new Date(w.savedAt).toISOString(), getLang())}</Notice>}
          <DayStrip days={days} showEt0={worker} />
          <p class="small">{t("weatherSource")}</p>
        </>
      )}
    </Screen>
  );
}

export function IrrigationScreen({ placeId, prefs, onPrefs, pickPlace, back, worker = false }: {
  placeId?: string; prefs: IrrPrefs; onPrefs: (p: IrrPrefs) => void; pickPlace: boolean; back: string; worker?: boolean;
}) {
  const [pid, setPid] = useState(placeId ?? PLACES[0].id);
  const [p, setP] = useState<IrrPrefs>(prefs);
  const [shown, setShown] = useState(false);
  const [editing, setEditing] = useState(true);
  const [pickDate, setPickDate] = useState(false);
  const w = useWeather(pid);
  const resultRef = useRef<HTMLDivElement>(null);
  const set = (k: keyof IrrPrefs) => (v: string) => { setP({ ...p, [k]: v }); setShown(false); };
  const now = today();
  const lastOk = /^\d{4}-\d{2}-\d{2}$/.test(p.lastWatered) && p.lastWatered <= now;
  const result = shown && w && lastOk
    ? advise({ crop: p.crop, soil: p.soil, stage: p.stage, areaAcres: p.areaAcres, lastWatered: p.lastWatered, today: now, days: w.value })
    : null;
  const line = result ? adviceLine(result) : null;
  const sentence = line ? tk(line.key) : "";

  useEffect(() => {
    if (result && resultRef.current) { resultRef.current.scrollIntoView({ block: "center" }); resultRef.current.focus(); }
  }, [shown]);

  const choices = wateredChoices(now);
  const form = (
    <>
      <Select label={t("crop")} value={p.crop} onChange={set("crop")} options={Object.entries(CROPS).map(([k, c]) => ({ value: k, label: tx(c) }))} />
      <Select label={t("soil")} value={p.soil} onChange={set("soil")} options={Object.entries(SOILS).map(([k, s]) => ({ value: k, label: tx(s) }))} />
      <Select label={t("stage")} value={p.stage} onChange={set("stage")} options={(["initial", "mid", "late"] as const).map(s => ({ value: s, label: tk(`stage_${s}`) }))} />
      {worker ? (
        <Field label={t("lastWatered")} error={shown && !lastOk ? t("lastWateredMissing") : false}>
          <input type="date" max={now} value={p.lastWatered} onInput={e => set("lastWatered")((e.target as HTMLInputElement).value)} />
        </Field>
      ) : (
        <fieldset class={`chip-group${shown && !lastOk ? " has-error" : ""}`}>
          <legend>{t("lastWatered")}</legend>
          <div class="chips">
            {choices.map(c => {
              const on = c.date ? p.lastWatered === c.date && !pickDate : pickDate;
              return (
                <button type="button" key={c.key} class={`chip${on ? " on" : ""}`} aria-pressed={on}
                  onClick={() => { if (c.date) { setPickDate(false); set("lastWatered")(c.date); } else setPickDate(true); }}>
                  {tk(c.key)}
                </button>
              );
            })}
          </div>
          {pickDate && <Field label={t("pickDate")}><input type="date" max={now} value={p.lastWatered} onInput={e => set("lastWatered")((e.target as HTMLInputElement).value)} /></Field>}
          {shown && !lastOk && <p class="field-error"><Icon name="warn" size={20} />{t("lastWateredMissing")}</p>}
        </fieldset>
      )}
      <Field label={t("area")}>
        <input type="number" inputMode="decimal" min="0" step="any" value={p.areaAcres} onInput={e => set("areaAcres")((e.target as HTMLInputElement).value)} />
      </Field>
      <Btn onClick={() => { setShown(true); onPrefs(p); if (lastOk && w) setEditing(false); }} disabled={!w}>{t("getAdvice")}</Btn>
      {w === undefined && <p class="small" aria-live="polite">{t("weatherLoading")}</p>}
      {w === null && <Notice kind="warn">{t("weatherNone")}</Notice>}
    </>
  );

  return (
    <Screen title={t("irrigation")} back={back}>
      {pickPlace ? <Select label={t("place")} value={pid} onChange={setPid} options={PLACES.map(x => ({ value: x.id, label: tx(x) }))} />
        : <p class="lead">{tx(placeById(pid))}</p>}
      {result && line && (
        <div class={`advice ${result.action}`} role="status" tabIndex={-1} ref={resultRef}>
          <p class="advice-main"><Icon name={line.icon} size={40} />{sentence}</p>
          {line.days != null && <p>{t("nextWaterIn").replace("{n}", String(line.days))}</p>}
          {result.waterLitres > 0 && <p>{t("waterAmount").replace("{mm}", String(result.waterMm)).replace("{l}", result.waterLitres.toLocaleString("en-IN"))}</p>}
          <p class="small">{t("checkByHand")}</p>
          <ReadAloud text={adviceSpeech(sentence, line.days)} />
          <details class="why" open={worker}>
            <summary>{t("howWorkedOut")}</summary>
            <p>Kc {result.kc} · RAW {result.rawMm} {t("mm")} · {t("usedSince")} {result.depletionMm} {t("mm")} ({result.daysCounted} {t("days")}) · {t("dailyUse")} {result.dailyUseMm} {t("mm")}</p>
            <p class="small">{t("irrHow")}</p>
          </details>
          {!editing ? <Btn kind="ghost" onClick={() => setEditing(true)}>{t("change")}</Btn> : null}
        </div>
      )}
      {(editing || !result) && form}
    </Screen>
  );
}
