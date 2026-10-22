import { Icon, type IconName } from "./icons.tsx";
// Field worker view: works offline on this phone; sign in to sync with the team server.
import { useEffect, useState } from "preact/hooks";
import { Badge, Btn, Field, Notice, Screen, Select, Tile, problemText, reasonText, tk } from "./kit.tsx";
import { DEMO_BUILD } from "../data/api.ts";
import { t } from "./i18n.ts";
import { all, get, meta, onChange, pendingCount, remove, save, sync, type SyncReport } from "../data/db.ts";
import { currentUser, signIn, signOut, type User } from "../data/api.ts";
import { checkRow, consentAllowsStore, type Row } from "../../../shared/schema.ts";
import { importFarmers, FARMER_COLUMNS, CONSENT_COLUMNS, type ImportResult } from "../core/importFarmers.ts";
import { STATES } from "../core/places.ts";
import { showDate } from "../core/mandi.ts";
import { MandiScreen } from "./MandiScreen.tsx";
import { LeafScreen } from "./LeafScreen.tsx";
import { IrrigationScreen, DEFAULT_IRR, type IrrPrefs } from "./WeatherScreen.tsx";
import type { SyncRecord } from "../../../shared/sync.ts";
import { CalendarScreen, SchemesScreen } from "./InfoScreens.tsx";

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
type Farmer = SyncRecord & { name: string; village?: string; district?: string; state?: string; phone?: string;
  crops?: { crop: string; season?: string; area_acres?: number }[] | null; land_acres?: number | null; notes?: string; onboarded_at?: string };
type Visit = SyncRecord & { farmer_id: string; visited_on: string; purpose?: string; observations?: string; advice_given?: string; follow_up_on?: string };

function useTable<T>(table: "farmer" | "visit" | "consent" | "leaf_check") {
  const [rows, setRows] = useState<T[] | undefined>(undefined);
  useEffect(() => {
    const load = () => all<T>(table).then(setRows);
    load();
    return onChange(load);
  }, [table]);
  return rows;
}

function Tabs({ active }: { active: string }) {
  const tabs: [string, string, IconName][] = [["/fw", t("farmers"), "people"], ["/fw/new", t("onboard"), "plus"], ["/fw/mandi", t("mandi"), "rupee"],
    ["/fw/more", t("moreTab"), "more"], ["/fw/sync", t("syncTab"), "sync"]];
  return (
    <nav class="tabs" aria-label="Field worker">
      {tabs.map(([href, label, icon]) => (
        <a key={href} href={`#${href}`} class={active === href ? "on" : ""} aria-current={active === href ? "page" : undefined}><Icon name={icon} size={24} />{label}</a>
      ))}
    </nav>
  );
}

function FarmerList() {
  const farmers = useTable<Farmer>("farmer");
  const [q, setQ] = useState("");
  const list = (farmers ?? []).filter(f => !q || `${f.name} ${f.village ?? ""}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <Screen title={t("farmers")}>
      <Field label={t("search")}><input type="search" value={q} onInput={e => setQ((e.target as HTMLInputElement).value)} /></Field>
      {farmers?.length === 0 && (
        <Notice kind="info" title={t("noFarmers")}><p>{t("noFarmersHint")}</p><a class="btn primary" href="#/fw/new">+ {t("onboard")}</a></Notice>
      )}
      <ul class="list">
        {list.map(f => (
          <li key={f.id}><a class="list-item" href={`#/fw/farmer/${f.id}`}>
            <b>{f.name}</b><span>{[f.village, f.district].filter(Boolean).join(", ")}</span>
          </a></li>
        ))}
      </ul>
    </Screen>
  );
}

// ---------- onboarding: consent first, then details ----------
type ConsentForm = { given_by: string; guardian_name: string; guardian_relation: string; method: string;
  scope_store: boolean; scope_sync: boolean; scope_research_aggregate: boolean; recorded_at: string };

function Onboard() {
  const [step, setStep] = useState<1 | 2>(1);
  const [c, setC] = useState<ConsentForm>({ given_by: "self", guardian_name: "", guardian_relation: "", method: "paper_signed",
    scope_store: false, scope_sync: false, scope_research_aggregate: false, recorded_at: today() });
  const [f, setF] = useState<Record<string, string>>({ state: STATES[0], onboarded_at: today() });
  const [crops, setCrops] = useState<{ crop: string; season: string; area_acres: string }[]>([]);
  const [bad, setBad] = useState<Set<string>>(new Set());
  const set = (k: string) => (e: Event) => setF({ ...f, [k]: (e.target as HTMLInputElement).value });

  async function finish(e: Event) {
    e.preventDefault();
    const cropList = crops.filter(x => x.crop.trim()).map(x => ({ crop: x.crop.trim(), season: x.season || null, area_acres: x.area_acres === "" ? null : Number(x.area_acres) }));
    const draft = { id: "new", ...f, crops: cropList.length ? cropList : null, source: "app", language: f.language || null };
    const { row, problems } = checkRow("farmer", draft);
    if (problems.length) { setBad(new Set(problems.map(p => p.field))); return; }
    const consent = { subject_type: "farmer", given_by: c.given_by, method: c.method, recorded_at: c.recorded_at,
      guardian_name: c.given_by === "self" ? null : c.guardian_name || null, guardian_relation: c.given_by === "self" ? null : c.guardian_relation || null,
      scope_store: 1, scope_sync: c.scope_sync ? 1 : 0, scope_research_aggregate: c.scope_research_aggregate ? 1 : 0, language: document.documentElement.lang };
    delete row.id;
    const farmer = await save("farmer", row);
    await save("consent", { ...consent, subject_id: farmer.id });
    location.hash = `/fw/farmer/${farmer.id}`;
  }

  if (step === 1) {
    const ok = c.scope_store && /^\d{4}-\d{2}-\d{2}$/.test(c.recorded_at);
    return (
      <Screen title={t("consentTitle")}>
        <Notice kind="info"><p>{t("consentRead")}</p></Notice>
        <Select label={t("consentGivenBy")} value={c.given_by} onChange={v => setC({ ...c, given_by: v })}
          options={["self", "guardian"].map(v => ({ value: v, label: tk(`given_${v}`) }))} />
        {c.given_by !== "self" && (
          <>
            <Field label={t("guardianName")}><input value={c.guardian_name} onInput={e => setC({ ...c, guardian_name: (e.target as HTMLInputElement).value })} /></Field>
            <Field label={t("guardianRelation")}><input value={c.guardian_relation} onInput={e => setC({ ...c, guardian_relation: (e.target as HTMLInputElement).value })} /></Field>
          </>
        )}
        <Select label={t("consentMethod")} value={c.method} onChange={v => setC({ ...c, method: v })}
          options={["paper_signed", "verbal_recorded", "digital"].map(v => ({ value: v, label: tk(`method_${v}`) }))} />
        <label class="check"><input type="checkbox" checked={c.scope_store} onChange={e => setC({ ...c, scope_store: (e.target as HTMLInputElement).checked })} /> {t("scopeStore")} *</label>
        <label class="check"><input type="checkbox" checked={c.scope_sync} onChange={e => setC({ ...c, scope_sync: (e.target as HTMLInputElement).checked })} /> {t("scopeSync")}</label>
        <label class="check"><input type="checkbox" checked={c.scope_research_aggregate} onChange={e => setC({ ...c, scope_research_aggregate: (e.target as HTMLInputElement).checked })} /> {t("scopeResearch")}</label>
        <Field label={t("consentDate")}><input type="date" max={today()} value={c.recorded_at} onInput={e => setC({ ...c, recorded_at: (e.target as HTMLInputElement).value })} /></Field>
        {!ok && <p class="small">{t("consentNeeded")}</p>}
        <Btn disabled={!ok} onClick={() => setStep(2)}>{t("next")}</Btn>
      </Screen>
    );
  }

  const inp = (k: string, label: string, type = "text", opt = true) => (
    <Field label={label} error={bad.has(k)} hint={opt ? t("optional") : undefined}>
      <input type={type} step={type === "number" ? "any" : undefined} inputMode={type === "number" ? "decimal" : type === "tel" ? "tel" : undefined} value={f[k] ?? ""} onInput={set(k)} />
    </Field>
  );
  return (
    <Screen title={t("detailsTitle")}>
      <p><Badge kind="ok">{t("consentOnFile")}</Badge></p>
      <form noValidate class="stack" onSubmit={finish}>
        {inp("name", t("name"), "text", false)}
        {inp("phone", t("phone"), "tel")}
        {inp("village", t("village"))}
        {inp("block", t("block"))}
        {inp("district", t("district"))}
        <Select label={t("state")} value={f.state} onChange={v => setF({ ...f, state: v })} options={STATES.map(s => ({ value: s, label: s }))} />
        {inp("land_acres", t("landAcres"), "number")}
        {inp("irrigation_source", t("irrigationSource"))}
        <fieldset class={`crops${bad.has("crops") ? " has-error" : ""}`}>
          <legend>{t("crops")}</legend>
          {crops.map((x, i) => (
            <div class="crop-row" key={i}>
              <Field label={t("crop")}><input value={x.crop} onInput={e => setCrops(crops.map((y, j) => j === i ? { ...y, crop: (e.target as HTMLInputElement).value } : y))} /></Field>
              <Select label={t("season")} value={x.season} onChange={v => setCrops(crops.map((y, j) => j === i ? { ...y, season: v } : y))}
                options={[{ value: "", label: "—" }, ...["kharif", "rabi", "zaid", "perennial"].map(s => ({ value: s, label: s }))]} />
              <Field label={t("area")}><input type="number" inputMode="decimal" min="0" step="any" value={x.area_acres} onInput={e => setCrops(crops.map((y, j) => j === i ? { ...y, area_acres: (e.target as HTMLInputElement).value } : y))} /></Field>
            </div>
          ))}
          <Btn kind="ghost" onClick={() => setCrops([...crops, { crop: "", season: "", area_acres: "" }])}>+ {t("addCrop")}</Btn>
        </fieldset>
        <Field label={t("notes")} hint={t("optional")}><textarea value={f.notes ?? ""} onInput={set("notes")} /></Field>
        {bad.size > 0 && <Notice kind="bad">{t("fixErrors")}</Notice>}
        <div class="row">
          <Btn kind="ghost" onClick={() => setStep(1)}><Icon name="back" size={22} />{t("back")}</Btn>
          <button class="btn primary" type="submit">{t("save")}</button>
        </div>
      </form>
    </Screen>
  );
}

// ---------- farmer detail: visits timeline ----------
function FarmerDetail({ id }: { id: string }) {
  const [farmer, setFarmer] = useState<Farmer | null | undefined>(undefined);
  const visits = useTable<Visit>("visit");
  const consents = useTable<Row & SyncRecord>("consent");
  const checks = useTable<SyncRecord & { farmer_id: string; crop: string; top3: { label: string; prob: number }[]; abstained: number; checked_at: string }>("leaf_check");
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    const load = () => get<Farmer>("farmer", id).then(f => setFarmer(f && !Number(f.deleted) ? f : null));
    load();
    return onChange(load);
  }, [id]);
  if (farmer === undefined) return <p class="screen">{t("loading")}</p>;
  if (farmer === null) return <Screen title="—" back="/fw"><Notice kind="warn">{t("noFarmers")}</Notice></Screen>;

  const mine = (visits ?? []).filter(v => v.farmer_id === id).sort((a, b) => b.visited_on.localeCompare(a.visited_on));
  const consent = (consents ?? []).find(c => c.subject_id === id && consentAllowsStore(c));
  async function withdraw() {
    if (!confirm(t("withdrawConfirm"))) return;
    if (consent) await save("consent", { id: consent.id, withdrawn_at: today() });
    for (const v of mine) await remove("visit", v.id);
    for (const c of (checks ?? []).filter(c => c.farmer_id === id)) await remove("leaf_check", c.id);
    await remove("farmer", id);
    location.hash = "/fw";
  }
  return (
    <Screen title={farmer.name} back="/fw">
      <section class="card">
        <p>{[farmer.village, farmer.block, farmer.district, farmer.state].filter(Boolean).join(", ")}</p>
        {farmer.phone && <p><a class="btn ghost" href={`tel:${farmer.phone}`}><Icon name="phone" size={22} />{farmer.phone}</a></p>}
        {farmer.land_acres != null && <p>{t("landAcres")}: {farmer.land_acres}</p>}
        {farmer.crops?.length ? <p>{t("crops")}: {farmer.crops.map(c => [c.crop, c.season, c.area_acres != null ? `${c.area_acres} ac` : ""].filter(Boolean).join(" ")).join("; ")}</p> : null}
        {farmer.notes && <p>{farmer.notes}</p>}
        {consent ? <Badge kind="ok">{t("consentOnFile")} · {showDate(String(consent.recorded_at))}</Badge> : <Badge kind="warn">{t("consentNeeded")}</Badge>}
      </section>

      <h2>{t("visits")}</h2>
      {!adding && <Btn onClick={() => setAdding(true)}>+ {t("addVisit")}</Btn>}
      {adding && <VisitForm farmerId={id} onDone={() => setAdding(false)} />}
      {mine.length === 0 && !adding && <p class="small">{t("noVisits")}</p>}
      <ol class="timeline">
        {mine.map(v => (
          <li key={v.id}>
            <b>{showDate(v.visited_on)}</b>{v.purpose && ` · ${v.purpose}`}
            {v.observations && <p>{t("observations")}: {v.observations}</p>}
            {v.advice_given && <p>{t("adviceGiven")}: {v.advice_given}</p>}
            {v.follow_up_on && <p>{t("followUpOn")}: {showDate(v.follow_up_on)}</p>}
          </li>
        ))}
      </ol>

      <h2>{t("leafChecks")}</h2>
      <a class="btn ghost" href={`#/fw/leaf/${id}`}><Icon name="leaf" size={22} />{t("leaf")}</a>
      <ul class="list">
        {(checks ?? []).filter(c => c.farmer_id === id).map(c => (
          <li key={c.id} class="list-item static">
            <b>{showDate(c.checked_at)} · {c.crop}</b>
            <span>{c.abstained ? t("leafNotSure") : t("leafPossible")}: {c.top3?.map(g => `${g.label} ${Math.round(g.prob * 100)}%`).join(", ")}</span>
          </li>
        ))}
      </ul>

      <Btn kind="danger" onClick={withdraw}>{t("withdraw")}</Btn>
    </Screen>
  );
}

function VisitForm({ farmerId, onDone }: { farmerId: string; onDone: () => void }) {
  const [v, setV] = useState<Record<string, string>>({ visited_on: today() });
  const [bad, setBad] = useState<Set<string>>(new Set());
  const set = (k: string) => (e: Event) => setV({ ...v, [k]: (e.target as HTMLInputElement).value });
  async function submit(e: Event) {
    e.preventDefault();
    const { row, problems } = checkRow("visit", { id: "new", farmer_id: farmerId, source: "app", ...v });
    if (problems.length) { setBad(new Set(problems.map(p => p.field))); return; }
    delete row.id;
    await save("visit", row);
    onDone();
  }
  return (
    <form noValidate class="stack card" onSubmit={submit}>
      <Field label={t("visitedOn")} error={bad.has("visited_on")}><input type="date" max={today()} value={v.visited_on} onInput={set("visited_on")} /></Field>
      <Field label={t("purpose")} hint={t("optional")}><input value={v.purpose ?? ""} onInput={set("purpose")} /></Field>
      <Field label={t("observations")} hint={t("optional")}><textarea value={v.observations ?? ""} onInput={set("observations")} /></Field>
      <Field label={t("adviceGiven")} hint={t("optional")}><textarea value={v.advice_given ?? ""} onInput={set("advice_given")} /></Field>
      <Field label={t("followUpOn")} hint={t("optional")} error={bad.has("follow_up_on")}><input type="date" value={v.follow_up_on ?? ""} onInput={set("follow_up_on")} /></Field>
      <div class="row"><button class="btn primary" type="submit">{t("save")}</button><Btn kind="ghost" onClick={onDone}>{t("cancel")}</Btn></div>
    </form>
  );
}

// ---------- paste import ----------
function ImportScreen() {
  const [farmersText, setFarmersText] = useState("");
  const [consentText, setConsentText] = useState("");
  const [res, setRes] = useState<ImportResult | null>(null);
  const [done, setDone] = useState(0);
  async function check() {
    setRes(importFarmers(farmersText, consentText, await all<Row>("consent")));
    setDone(0);
  }
  async function run() {
    if (!res) return;
    for (const c of res.consents) await save("consent", c);
    for (const f of res.farmers) await save("farmer", { ...f, source: f.source ?? "spreadsheet" });
    setDone(res.farmers.length);
    setRes(null);
  }
  return (
    <Screen title={t("importTitle")} back="/fw/more">
      <p class="small">{t("importHelp")}</p>
      <details class="card"><summary>{t("farmersSheet")}: columns</summary><code class="cols">{FARMER_COLUMNS.join(", ")}</code></details>
      <details class="card"><summary>{t("consentSheet")}: columns</summary><code class="cols">{CONSENT_COLUMNS.join(", ")}</code></details>
      <Field label={t("farmersSheet")}><textarea rows={6} value={farmersText} onInput={e => setFarmersText((e.target as HTMLTextAreaElement).value)} /></Field>
      <Field label={t("consentSheet")}><textarea rows={4} value={consentText} onInput={e => setConsentText((e.target as HTMLTextAreaElement).value)} /></Field>
      <Btn onClick={check} disabled={!farmersText.trim()}>{t("check")}</Btn>
      {done > 0 && <Notice kind="ok">{done} {t("importedN")}</Notice>}
      {res && (
        <section class="card" aria-live="polite">
          <p><b>{res.farmers.length}</b> {t("rowsOk")} · <b>{res.rejected.length + res.consentErrors.length}</b> {t("rowsBad")}</p>
          <ul class="errors">
            {res.consentErrors.map(r => <li key={`c${r.line}`}>{t("consentSheet")} {t("line")} {r.line}: {r.problems.map(p => problemText(p)).join(", ")}</li>)}
            {res.rejected.map(r => <li key={`f${r.line}`}>{t("line")} {r.line} {r.name}: {r.problems.map(p => problemText(p)).join(", ")}</li>)}
          </ul>
          {res.farmers.length > 0 && <Btn onClick={run}>{t("importNow")} ({res.farmers.length})</Btn>}
        </section>
      )}
    </Screen>
  );
}

// ---------- sync + sign-in ----------
function SyncScreen() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [pending, setPending] = useState(0);
  const [last, setLast] = useState<SyncReport | undefined>(undefined);
  const [state, setState] = useState<"" | "busy" | "failed" | "signin">("");
  const [creds, setCreds] = useState({ email: "", password: "" });
  const [err, setErr] = useState("");
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const load = async () => { setUser((await currentUser()) ?? null); setPending(await pendingCount()); setLast(await meta<SyncReport>("lastSync")); };
    load();
    const on = () => setOnline(navigator.onLine);
    addEventListener("online", on); addEventListener("offline", on);
    const off = onChange(load);
    return () => { off(); removeEventListener("online", on); removeEventListener("offline", on); };
  }, []);

  async function doSync() {
    setState("busy");
    try { await sync(); setState(""); }
    catch (e) { setState(e instanceof Error && e.message === "signin" ? "signin" : "failed"); }
    setPending(await pendingCount());
  }

  if (user === undefined) return <p class="screen">{t("loading")}</p>;
  return (
    <Screen title={t("syncTab")}>
      {DEMO_BUILD && <Notice kind="info">{t("demoNoSync")}</Notice>}
      <p><Badge kind={online ? "ok" : "warn"}>{online ? t("online") : t("offline")}</Badge></p>
      <section class="card">
        <p>{t("pending")}: <b>{pending}</b></p>
        <p>{t("lastSync")}: {last ? new Date(last.at).toLocaleString("en-IN") : t("never")}</p>
        {last && last.keptLocal > 0 && <p>{t("keptLocal")}: <b>{last.keptLocal}</b></p>}
        {last && last.rejected.length > 0 && (
          <Notice kind="warn" title={`${t("rejected")}: ${last.rejected.length}`}>
            <ul>{last.rejected.map(r => <li key={`${r.table}:${r.id}`}>{r.table} {r.id}: {reasonText(r.reason)}</li>)}</ul>
          </Notice>
        )}
      </section>
      {DEMO_BUILD ? null : user ? (
        <>
          <p>{user.name} ({user.role})</p>
          <Btn onClick={doSync} disabled={state === "busy" || !online}>{state === "busy" ? t("loading") : t("syncNow")}</Btn>
          {state === "failed" && <Notice kind="bad">{t("syncFailed")}</Notice>}
          {state === "signin" && <Notice kind="warn">{t("syncSignin")}</Notice>}
          <Btn kind="ghost" onClick={async () => { await signOut(); setUser(null); }}>{t("signOut")}</Btn>
        </>
      ) : (
        <form noValidate class="stack card" onSubmit={async e => {
          e.preventDefault(); setErr("");
          try { setUser(await signIn(creds.email, creds.password)); } catch (x) { setErr(x instanceof Error ? x.message : "error"); }
        }}>
          <p class="small">{t("signInWhy")}</p>
          <Field label={t("email")}><input type="email" autoComplete="username" value={creds.email} onInput={e => setCreds({ ...creds, email: (e.target as HTMLInputElement).value })} /></Field>
          <Field label={t("password")}><input type="password" autoComplete="current-password" value={creds.password} onInput={e => setCreds({ ...creds, password: (e.target as HTMLInputElement).value })} /></Field>
          {err && <Notice kind="bad">{err}</Notice>}
          <button class="btn primary" type="submit">{t("signIn")}</button>
        </form>
      )}
    </Screen>
  );
}

function More() {
  return (
    <Screen title={t("moreTab")}>
      <div class="tiles">
        <Tile href="/fw/import" icon="clipboard" label={t("import")} />
        <Tile href="/fw/leaf" icon="leaf" label={t("leaf")} />
        <Tile href="/fw/irrigation" icon="drop" label={t("irrigation")} />
        <Tile href="/fw/schemes" icon="doc" label={t("schemes")} />
        <Tile href="/fw/calendar" icon="calendar" label={t("calendar")} />
      </div>
    </Screen>
  );
}

export function WorkerView({ path }: { path: string }) {
  const [irr, setIrr] = useState<IrrPrefs>(DEFAULT_IRR);
  let body;
  const m = /^\/fw\/(farmer|leaf)\/(.+)$/.exec(path);
  if (m?.[1] === "farmer") body = <FarmerDetail id={m[2]} />;
  else if (m?.[1] === "leaf") body = <LeafScreen farmerId={m[2]} back={`/fw/farmer/${m[2]}`} />;
  else switch (path) {
    case "/fw/new": body = <Onboard />; break;
    case "/fw/mandi": body = <MandiScreen worker back="/fw" />; break;
    case "/fw/sync": body = <SyncScreen />; break;
    case "/fw/more": body = <More />; break;
    case "/fw/import": body = <ImportScreen />; break;
    case "/fw/leaf": body = <LeafScreen back="/fw/more" />; break;
    case "/fw/schemes": body = <SchemesScreen back="/fw/more" />; break;
    case "/fw/calendar": body = <CalendarScreen back="/fw/more" />; break;
    case "/fw/irrigation": body = <IrrigationScreen pickPlace prefs={irr} onPrefs={setIrr} back="/fw/more" />; break;
    default: body = <FarmerList />;
  }
  const tab = ["/fw", "/fw/new", "/fw/mandi", "/fw/sync"].includes(path) ? path : m ? "/fw" : "/fw/more";
  return <>{body}<Tabs active={tab} /></>;
}

