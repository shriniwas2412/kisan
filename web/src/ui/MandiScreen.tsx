import { useEffect, useState } from "preact/hooks";
import { Badge, Btn, Field, Notice, Screen, Select, tk } from "./kit.tsx";
import { getLang, t, tx } from "./i18n.ts";
import { PLACES, placeById } from "../core/places.ts";
import { commoditiesIn, freshness, manualFor, rowsFor, rupees, showDate, type ManualPrice } from "../core/mandi.ts";
import { getMandi, type MandiFetched } from "../data/api.ts";
import { snapshotLabel } from "../core/demo.ts";
import { all, save, onChange } from "../data/db.ts";
import { checkRow } from "../../../shared/schema.ts";

const todayIso = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

export function MandiScreen({ worker, placeId, picked, onPick, back }: {
  worker: boolean; placeId?: string; picked?: string[]; onPick?: (c: string[]) => void; back: string;
}) {
  const [pid, setPid] = useState(placeId ?? PLACES[0].id);
  const place = placeById(pid)!;
  const [res, setRes] = useState<MandiFetched | null | undefined>(undefined);
  const [chosen, setChosen] = useState<string>(picked?.[0] ?? "");
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
  const list = rowsFor(rows, chosen ? [chosen] : []);
  const fresh = freshness(answer ?? null, todayIso());
  const manualRows = manualFor(manual, chosen ? [chosen] : [], place.district);
  const reason = res === null ? "offline" : answer && !answer.available ? answer.reason : "";

  return (
    <Screen title={fresh === "today" && !res?.snapshot ? t("todayRate") : t("mandiRate")} back={back}>
      {worker && (
        <Select label={t("place")} value={pid} onChange={setPid} options={PLACES.map(p => ({ value: p.id, label: tx(p) }))} />
      )}
      {!worker && <p class="lead">{tx(place)}</p>}

      {res === undefined && <p aria-live="polite">{t("loading")}</p>}

      {res !== undefined && fresh === "none" && (
        <Notice kind="warn" title={t("mandiNone")}>
          <p>{reason ? tk(`mandiNoneWhy_${reason}`) : t("mandiNoneWhy_no_records")}</p>
        </Notice>
      )}

      {rows.length > 0 && (
        <>
          <Select label={t("commodity")} value={chosen}
            onChange={c => { setChosen(c); onPick?.(c ? [c] : []); }}
            options={[{ value: "", label: t("allCommodities") }, ...commoditiesIn(rows).map(c => ({ value: c, label: c }))]} />
          <div class="row-between">
            <Badge kind="gov">{t("agmarknetBadge")}</Badge>
            {res?.snapshot ? <span class="fresh stale">{snapshotLabel(answer!.available ? answer!.as_of ?? "" : "", getLang())}</span> :
            <span class={`fresh ${fresh}`}>
              {fresh === "today" && t("mandiToday")}
              {fresh === "older" && t("mandiOlder")}
              {fresh === "stale" && t("mandiStale")}
              {" · "}{t("asOf")} {showDate(answer!.available ? answer!.as_of : null)}
            </span>}
          </div>
          {res?.snapshot && (
            <Notice kind="warn" title={t("snapshotTitle")}>
              <p>{t("snapshotWhy")} {res.snapshot.scope === "state" && t("snapshotStateWide")}</p>
              <p><a href={res.snapshot.dataset_url} target="_blank" rel="noopener">data.gov.in: Agmarknet mandi prices</a></p>
            </Notice>
          )}
          {res?.offline && <Notice kind="warn">{t("mandiOffline")} · {t("savedAt")} {new Date(res.savedAt).toLocaleString("en-IN")}</Notice>}
          <ul class="price-list">
            {list.map(r => (
              <li key={`${r.market}|${r.commodity}|${r.variety}|${r.arrival_date}`} class="price">
                <div class="price-main">
                  <span class="price-modal">{rupees(r.modal_price)}</span>
                  <span class="unit">{t("perQuintal")}</span>
                </div>
                <div class="price-meta">
                  <b>{r.commodity}</b>{r.variety && ` · ${r.variety}`}<br />
                  {r.market} · {showDate(r.arrival_date)}<br />
                  {t("minMax")}: {rupees(r.min_price)} – {rupees(r.max_price)}
                </div>
              </li>
            ))}
          </ul>
          {answer?.available && answer.truncated && (
            <p class="small">{list.length} {t("showingRows")} ({t("ofTotal")} {answer.total})</p>
          )}
          <p class="small">{t("source")}: <a href="https://agmarknet.gov.in/" target="_blank" rel="noopener">Agmarknet</a> via <a href="https://data.gov.in/resource/current-daily-price-various-commodities-various-markets-mandi" target="_blank" rel="noopener">data.gov.in</a></p>
        </>
      )}

      {(manualRows.length > 0 || worker) && (
        <section class="card manual" aria-labelledby="manual-h">
          <h2 id="manual-h">{t("manualTitle")}</h2>
          <p class="small">{t("manualNote")}</p>
          {manualRows.map(m => (
            <div class="price" key={m.id}>
              <div class="price-main"><span class="price-modal">{rupees(m.modal_rs_q)}</span><span class="unit">{t("perQuintal")}</span></div>
              <div class="price-meta">
                <Badge kind="manual">{t("manualBadge")}</Badge><br />
                <b>{m.commodity}</b>{m.variety && ` · ${m.variety}`} · {m.market} · {showDate(m.observed_on)}
              </div>
            </div>
          ))}
          {worker && !adding && <Btn kind="ghost" onClick={() => setAdding(true)}>+ {t("addManual")}</Btn>}
          {worker && adding && <ManualForm district={place.district} state={place.state} onDone={() => setAdding(false)} />}
        </section>
      )}
    </Screen>
  );
}

function ManualForm({ district, state, onDone }: { district: string; state: string; onDone: () => void }) {
  const [f, setF] = useState<Record<string, string>>({ observed_on: todayIso() });
  const [bad, setBad] = useState<Set<string>>(new Set());
  const set = (k: string) => (e: Event) => setF({ ...f, [k]: (e.target as HTMLInputElement).value });
  async function submit(e: Event) {
    e.preventDefault();
    const { row, problems } = checkRow("mandi_price_manual", { id: "new", ...f, district, state, source: "field_worker" });
    if (problems.length) { setBad(new Set(problems.map(p => p.field))); return; }
    delete row.id;
    await save("mandi_price_manual", row);
    onDone();
  }
  const inp = (k: string, label: string, type = "text", hint?: string) => (
    <Field label={label} error={bad.has(k)} hint={hint}>
      <input type={type} step={type === "number" ? "any" : undefined} inputMode={type === "number" ? "decimal" : undefined} value={f[k] ?? ""} onInput={set(k)} />
    </Field>
  );
  return (
    <form noValidate onSubmit={submit} class="stack">
      {inp("market", t("market"))}
      {inp("commodity", t("crop"))}
      {inp("variety", "Variety", "text", t("optional"))}
      {inp("modal_rs_q", `${t("modal")} (${t("perQuintal")})`, "number")}
      {inp("min_rs_q", "Min", "number", t("optional"))}
      {inp("max_rs_q", "Max", "number", t("optional"))}
      {inp("observed_on", t("observedOn"), "date")}
      {bad.size > 0 && <Notice kind="bad">{t("fixErrors")}</Notice>}
      <div class="row"><button class="btn primary" type="submit">{t("save")}</button><Btn kind="ghost" onClick={onDone}>{t("cancel")}</Btn></div>
    </form>
  );
}
