// Mandi prices. Farmer view: their crops first as chips with Hindi names, one date chip,
// the explanation folded away. Field-worker view: any place, Agmarknet wording, and
// prices they saw themselves (kept apart, with their own badge).
import { useEffect, useState } from "preact/hooks";
import { Badge, Btn, Field, Notice, Screen, Select, focusFirstInvalid, problemText, tk } from "./kit.tsx";
import { getLang, t, tx } from "./i18n.ts";
import { PLACES, placeById } from "../core/places.ts";
import { commoditiesIn, freshness, manualFor, rowsFor, rupees, type ManualPrice, type MandiRow } from "../core/mandi.ts";
import { commodityHi, FARM_CROPS, shortDate } from "../core/farmView.ts";
import { getMandi, type MandiFetched } from "../data/api.ts";
import { all, save, onChange } from "../data/db.ts";
import { checkRow, type Problem } from "../../../shared/schema.ts";

const todayIso = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const DATASET = "https://data.gov.in/resource/current-daily-price-various-commodities-various-markets-mandi";

/** Commodity in the current language; the Agmarknet string stays visible, small, in English. */
export function CommodityName({ name }: { name: string }) {
  const hi = commodityHi(name);
  if (getLang() === "en" || hi === name) return <b lang="en">{name}</b>;
  return <><b>{hi}</b> <span class="src-name" lang="en">{name}</span></>;
}

function PriceRow({ r }: { r: MandiRow }) {
  return (
    <li class="price">
      <div class="price-main">
        <span class="price-modal">{rupees(r.modal_price)}</span>
        <span class="unit">{t("perQuintal")}</span>
      </div>
      <div class="price-meta">
        <CommodityName name={r.commodity} />{r.variety && r.variety !== r.commodity && <span class="src-name" lang="en"> · {r.variety}</span>}<br />
        <span lang="en">{r.market}</span> · {shortDate(r.arrival_date, getLang())}<br />
        {t("minMax")}: {rupees(r.min_price)} – {rupees(r.max_price)}
      </div>
    </li>
  );
}

export function MandiScreen({ worker, placeId, crops = [], back }: { worker: boolean; placeId?: string; crops?: string[]; back: string }) {
  const [pid, setPid] = useState(placeId ?? PLACES[0].id);
  const place = placeById(pid)!;
  const [res, setRes] = useState<MandiFetched | null | undefined>(undefined);
  const [chosen, setChosen] = useState<string>("");
  const [manual, setManual] = useState<ManualPrice[]>([]);
  const [adding, setAdding] = useState(false);

  useEffect(() => { setRes(undefined); getMandi(place.state, place.district).then(setRes); }, [pid]);
  useEffect(() => {
    const load = () => all<ManualPrice>("mandi_price_manual").then(setManual);
    load();
    return onChange(load);
  }, []);

  const answer = res?.value;
  const rows = answer?.available ? answer.records : [];
  const inReport = commoditiesIn(rows);
  // The farmer's crops first (when this report has them), then everything else in the report.
  const mine = crops.flatMap(id => FARM_CROPS.find(c => c.id === id)?.commodities ?? []).filter(c => inReport.includes(c));
  const chipOrder = [...new Set([...mine, ...inReport])];
  const pick = chosen || mine[0] || "";
  const list = rowsFor(rows, pick ? [pick] : []);
  const fresh = freshness(answer ?? null, todayIso());
  const manualRows = manualFor(manual, pick ? [pick] : [], place.district);
  const reason = res === null ? "offline" : answer && !answer.available ? answer.reason : "";
  const asOf = answer?.available ? answer.as_of : null;
  const old = !!res?.snapshot || fresh !== "today";

  return (
    <Screen title={old ? t("mandiRate") : t("todayRate")} back={back}>
      {worker
        ? <Select label={t("place")} value={pid} onChange={v => { setPid(v); setChosen(""); }} options={PLACES.map(p => ({ value: p.id, label: tx(p) }))} />
        : <p class="lead">{tx(place)}</p>}

      {res === undefined && <p aria-live="polite">{t("loading")}</p>}

      {res !== undefined && fresh === "none" && (
        <Notice kind="warn" title={t("mandiNone")}>
          <p>{reason ? tk(`mandiNoneWhy_${reason}`) : t("mandiNoneWhy_no_records")}</p>
        </Notice>
      )}

      {rows.length > 0 && (
        <>
          {worker ? (
            <Select label={t("commodity")} value={pick} onChange={setChosen}
              options={[{ value: "", label: t("allCommodities") }, ...inReport.map(c => ({ value: c, label: commodityHi(c) === c ? c : `${commodityHi(c)} (${c})` }))]} />
          ) : (
            <fieldset class="chip-group">
              <legend>{t("chooseCrop")}</legend>
              <div class="chips">
                {chipOrder.map(c => (
                  <button type="button" key={c} class={`chip${pick === c ? " on" : ""}`} aria-pressed={pick === c} onClick={() => setChosen(c)}>
                    {getLang() === "en" ? c : commodityHi(c)}
                  </button>
                ))}
                <button type="button" class={`chip${!pick ? " on" : ""}`} aria-pressed={!pick} onClick={() => setChosen("")}>{t("allCommodities")}</button>
              </div>
            </fieldset>
          )}
          {crops.length > 0 && !worker && mine.length === 0 && (
            <p class="small">{t("noneOfMyCrops")}</p>
          )}

          <p class={`date-chip${old ? " old" : ""}`}>
            {res?.snapshot ? t("snapshotChip").replace("{d}", shortDate(asOf, getLang()))
              : `${fresh === "today" ? t("mandiToday") : fresh === "stale" ? t("mandiStale") : t("mandiOlder")} · ${shortDate(asOf, getLang())}`}
          </p>
          {(res?.snapshot || res?.offline || fresh !== "today") && (
            <details class="why">
              <summary>{t("whyNotToday")}</summary>
              {res?.snapshot && <p>{t("snapshotWhy")} {res.snapshot.scope === "state" && t("snapshotStateWide")}</p>}
              {res?.offline && <p>{t("mandiOffline")} · {t("savedAt")} {shortDate(new Date(res.savedAt).toISOString(), getLang())}</p>}
              {!res?.snapshot && fresh === "older" && <p>{t("olderWhy")}</p>}
              {!res?.snapshot && fresh === "stale" && <p>{t("staleWhy")}</p>}
            </details>
          )}

          <ul class="price-list">{list.map(r => <PriceRow key={`${r.market}|${r.commodity}|${r.variety}|${r.arrival_date}`} r={r} />)}</ul>
          {answer?.available && answer.truncated && <p class="small">{list.length} {t("showingRows")} ({t("ofTotal")} {answer.total})</p>}
          <p class="small source-line">
            <Badge kind="gov">{t("agmarknetBadge")}</Badge>{" "}
            <a href="https://agmarknet.gov.in/" target="_blank" rel="noopener">Agmarknet</a> · <a href={DATASET} target="_blank" rel="noopener">data.gov.in</a>
          </p>
        </>
      )}

      {(manualRows.length > 0 || worker) && (
        <section class="card manual" aria-labelledby="manual-h">
          <h2 id="manual-h">{t("manualTitle")}</h2>
          <p class="small">{t("manualNote")}</p>
          <ul class="price-list">
            {manualRows.map(m => (
              <li class="price" key={m.id}>
                <div class="price-main"><span class="price-modal">{rupees(m.modal_rs_q)}</span><span class="unit">{t("perQuintal")}</span></div>
                <div class="price-meta">
                  <Badge kind="manual">{t("manualBadge")}</Badge><br />
                  <CommodityName name={m.commodity} />{m.variety && ` · ${m.variety}`} · {m.market} · {shortDate(m.observed_on, getLang())}
                </div>
              </li>
            ))}
          </ul>
          {worker && !adding && <Btn kind="ghost" onClick={() => setAdding(true)}>+ {t("addManual")}</Btn>}
          {worker && adding && <ManualForm district={place.district} state={place.state} onDone={() => setAdding(false)} />}
        </section>
      )}
    </Screen>
  );
}

function ManualForm({ district, state, onDone }: { district: string; state: string; onDone: () => void }) {
  const [f, setF] = useState<Record<string, string>>({ observed_on: todayIso() });
  const [bad, setBad] = useState<Problem[]>([]);
  const set = (k: string) => (e: Event) => setF({ ...f, [k]: (e.target as HTMLInputElement).value });
  const labels: Record<string, string> = {
    market: t("market"), commodity: t("crop"), variety: t("variety"), modal_rs_q: t("modal"), min_rs_q: t("minPrice"), max_rs_q: t("maxPrice"), observed_on: t("observedOn"),
  };
  async function submit(e: Event) {
    e.preventDefault();
    const { row, problems } = checkRow("mandi_price_manual", { id: "new", ...f, district, state, source: "field_worker" });
    if (problems.length) { setBad(problems); focusFirstInvalid(); return; }
    delete row.id;
    await save("mandi_price_manual", row);
    onDone();
  }
  const err = (k: string) => { const p = bad.find(x => x.field === k); return p ? problemText(p, labels[k]) : false; };
  const inp = (k: string, type = "text", optional = false) => (
    <Field label={type === "number" && k.endsWith("_q") ? `${labels[k]} (${t("perQuintal")})` : labels[k]} error={err(k)} hint={optional ? t("optional") : undefined}>
      <input type={type} step={type === "number" ? "any" : undefined} inputMode={type === "number" ? "decimal" : undefined} value={f[k] ?? ""} onInput={set(k)} />
    </Field>
  );
  return (
    <form noValidate onSubmit={submit} class="stack">
      {inp("market")}
      {inp("commodity")}
      {inp("variety", "text", true)}
      {inp("modal_rs_q", "number")}
      {inp("min_rs_q", "number", true)}
      {inp("max_rs_q", "number", true)}
      {inp("observed_on", "date")}
      {bad.length > 0 && <Notice kind="bad">{t("fixErrors")}</Notice>}
      <div class="row"><button class="btn primary" type="submit">{t("save")}</button><Btn kind="ghost" onClick={onDone}>{t("cancel")}</Btn></div>
    </form>
  );
}
