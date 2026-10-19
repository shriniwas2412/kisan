import { useEffect, useState } from "preact/hooks";
import { Btn, Field, Notice, Screen, Select, tk } from "./kit.tsx";
import { t, tx } from "./i18n.ts";
import { PLACES, placeById } from "../core/places.ts";
import { advise, CROPS, SOILS, type Day, type Stage } from "../core/irrigation.ts";
import { getWeather, type Fetched } from "../data/api.ts";
import { showDate } from "../core/mandi.ts";

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

export function WeatherScreen({ placeId, pickPlace, back }: { placeId?: string; pickPlace: boolean; back: string }) {
  const [pid, setPid] = useState(placeId ?? PLACES[0].id);
  const w = useWeather(pid);
  const now = today();
  const days = w?.value.filter(d => d.date >= now).slice(0, 4) ?? [];
  return (
    <Screen title={t("weather")} back={back}>
      {pickPlace ? <Select label={t("place")} value={pid} onChange={setPid} options={PLACES.map(p => ({ value: p.id, label: tx(p) }))} />
        : <p class="lead">{tx(placeById(pid))}</p>}
      {w === undefined && <p>{t("loading")}</p>}
      {w === null && <Notice kind="warn" title={t("weatherNone")}>{t("offline")}</Notice>}
      {w && (
        <>
          {w.offline && <Notice kind="warn">{t("offline")} · {t("savedAt")} {new Date(w.savedAt).toLocaleString("en-IN")}</Notice>}
          <ul class="days">
            {days.map(d => (
              <li key={d.date} class="day">
                <b>{showDate(d.date)}</b>
                <span>🌧 {d.rain.toFixed(1)} mm</span>
                {d.tmax != null && <span>🌡 {Math.round(d.tmax)}°C</span>}
                <span>ET₀ {d.et0.toFixed(1)}</span>
              </li>
            ))}
          </ul>
          <p class="small">Open-Meteo (open-meteo.com) · ET₀ = FAO-56 Penman-Monteith</p>
        </>
      )}
    </Screen>
  );
}

export function IrrigationScreen({ placeId, prefs, onPrefs, pickPlace, back }: {
  placeId?: string; prefs: IrrPrefs; onPrefs: (p: IrrPrefs) => void; pickPlace: boolean; back: string;
}) {
  const [pid, setPid] = useState(placeId ?? PLACES[0].id);
  const [p, setP] = useState<IrrPrefs>(prefs);
  const [shown, setShown] = useState(false);
  const w = useWeather(pid);
  const set = (k: keyof IrrPrefs) => (v: string) => { setP({ ...p, [k]: v }); setShown(false); };
  const lastOk = /^\d{4}-\d{2}-\d{2}$/.test(p.lastWatered) && p.lastWatered <= today();
  const result = shown && w && lastOk
    ? advise({ crop: p.crop, soil: p.soil, stage: p.stage, areaAcres: p.areaAcres, lastWatered: p.lastWatered, today: today(), days: w.value })
    : null;

  return (
    <Screen title={t("irrigation")} back={back}>
      {pickPlace ? <Select label={t("place")} value={pid} onChange={setPid} options={PLACES.map(x => ({ value: x.id, label: tx(x) }))} />
        : <p class="lead">{tx(placeById(pid))}</p>}
      <Select label={t("crop")} value={p.crop} onChange={set("crop")} options={Object.entries(CROPS).map(([k, c]) => ({ value: k, label: tx(c) }))} />
      <Select label={t("soil")} value={p.soil} onChange={set("soil")} options={Object.entries(SOILS).map(([k, s]) => ({ value: k, label: tx(s) }))} />
      <Select label={t("stage")} value={p.stage} onChange={set("stage")} options={(["initial", "mid", "late"] as const).map(s => ({ value: s, label: tk(`stage_${s}`) }))} />
      <Field label={t("lastWatered")} error={shown && !lastOk}>
        <input type="date" max={today()} value={p.lastWatered} onInput={e => set("lastWatered")((e.target as HTMLInputElement).value)} />
      </Field>
      <Field label={t("area")}>
        <input type="number" inputMode="decimal" min="0" step="any" value={p.areaAcres} onInput={e => set("areaAcres")((e.target as HTMLInputElement).value)} />
      </Field>
      <Btn onClick={() => { setShown(true); onPrefs(p); }} disabled={!w}>{t("getAdvice")}</Btn>
      {!w && w !== undefined && <Notice kind="warn">{t("weatherNone")}</Notice>}
      {result && (
        <div class={`advice ${result.action}`} role="status">
          <p class="advice-main">{tk(`irr_${result.action}`)}</p>
          {result.waterLitres > 0 && <p>{result.waterMm} mm ≈ {result.waterLitres.toLocaleString("en-IN")} {t("litres")}</p>}
          {result.daysUntil !== null && result.action === "no_need" && <p>{result.daysUntil} {t("daysUntil")}</p>}
          <p class="small">Kc {result.kc} · RAW {result.rawMm} mm · {result.depletionMm} mm / {result.daysCounted} d</p>
        </div>
      )}
      <p class="small">{t("irrHow")}</p>
    </Screen>
  );
}
