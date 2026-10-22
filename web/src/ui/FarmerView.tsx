// Farmer's own view: no login, Hindi by default, big tiles, one thing per screen.
// Home = "my crop" price (one real Agmarknet row) + "what to do in the field today".
import { useEffect, useState } from "preact/hooks";
import { Btn, ReadAloud, Screen, Select, Tile, tk } from "./kit.tsx";
import { getLang, t, tx } from "./i18n.ts";
import { Icon } from "./icons.tsx";
import { PLACES, placeById } from "../core/places.ts";
import { meta, setMeta } from "../data/db.ts";
import { getMandi, type MandiFetched } from "../data/api.ts";
import { rupees } from "../core/mandi.ts";
import { advise } from "../core/irrigation.ts";
import { adviceLine, commodityHi, cropName, FARM_CROPS, heroFor, rangeBar, shortDate } from "../core/farmView.ts";
import { adviceSpeech, priceSpeech } from "../core/speech.ts";
import { MandiScreen } from "./MandiScreen.tsx";
import { DayStrip, IrrigationScreen, WeatherScreen, DEFAULT_IRR, useWeather, type IrrPrefs } from "./WeatherScreen.tsx";
import { LeafScreen } from "./LeafScreen.tsx";
import { AboutScreen, CalendarScreen, SchemesScreen } from "./InfoScreens.tsx";

const todayIso = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

export type FarmerProfile = { placeId: string; commodities: string[]; crops: string[]; irr: IrrPrefs };

export function useProfile() {
  const [p, setP] = useState<FarmerProfile | null | undefined>(undefined);
  useEffect(() => { meta<FarmerProfile>("farmerProfile").then(v => setP(v ?? null)); }, []);
  const update = async (next: FarmerProfile) => { setP(next); await setMeta("farmerProfile", next); };
  return [p, update] as const;
}

function Setup({ profile, onSave }: { profile: FarmerProfile | null; onSave: (p: FarmerProfile) => void }) {
  const [placeId, setPlace] = useState(profile?.placeId ?? PLACES[0].id);
  const [crops, setCrops] = useState<string[]>(profile?.crops ?? []);
  const toggle = (c: string) => setCrops(crops.includes(c) ? crops.filter(x => x !== c) : [...crops, c]);
  const lang = getLang();
  return (
    <Screen title={t("setup")} back={profile ? "/farmer" : "/"}>
      <Select label={t("place")} value={placeId} onChange={setPlace} options={PLACES.map(p => ({ value: p.id, label: tx(p) }))} />
      <fieldset class="chip-group">
        <legend>{t("myCrops")}</legend>
        <div class="chips">
          {FARM_CROPS.map(c => (
            <button type="button" key={c.id} class={`chip${crops.includes(c.id) ? " on" : ""}`} aria-pressed={crops.includes(c.id)} onClick={() => toggle(c.id)}>
              {c[lang]}
            </button>
          ))}
        </div>
      </fieldset>
      <Btn onClick={() => onSave({ placeId, crops, commodities: profile?.commodities ?? [], irr: profile?.irr ?? DEFAULT_IRR })}>{t("save")}</Btn>
    </Screen>
  );
}

/** The farmer's crop, its modal price and the min-modal-max bar, all from one Agmarknet row. */
function CropHero({ profile }: { profile: FarmerProfile }) {
  const place = placeById(profile.placeId)!;
  const [res, setRes] = useState<MandiFetched | null | undefined>(undefined);
  useEffect(() => { getMandi(place.state, place.district).then(setRes); }, [profile.placeId]);
  const a = res?.value;
  const { crop, row } = heroFor(a?.available ? a.records : [], profile.crops);
  const lang = getLang();
  const bar = row ? rangeBar(row) : null;
  const old = !!res?.snapshot || (row ? row.arrival_date !== todayIso() : false);
  const dateText = row ? shortDate(row.arrival_date, lang) : "";
  return (
    <section class="hero" aria-labelledby="hero-h">
      <p class="hero-label" id="hero-h"><Icon name="rupee" size={26} />{old ? t("mandiRate") : t("todayRate")}</p>
      {res === undefined && <p class="hero-sub">{t("loading")}</p>}
      {res !== undefined && !profile.crops.length && <p class="hero-sub">{t("pickCropsFirst")} <a href="#/farmer/setup">{t("changePlace")}</a></p>}
      {res !== undefined && profile.crops.length > 0 && !row && (
        <p class="hero-sub">{t("noPriceForCrop").replace("{crop}", cropName(crop ?? "", lang))}</p>
      )}
      {row && (
        <>
          <p class="hero-crop">{lang === "en" ? row.commodity : commodityHi(row.commodity)}</p>
          <p class="hero-price">{rupees(row.modal_price)} <span class="unit">{t("perQuintal")}</span></p>
          <p class="hero-sub"><span lang="en">{row.market}</span> · <span class={`hero-date${old ? " old" : ""}`}>
            {res?.snapshot ? t("snapshotChip").replace("{d}", dateText) : dateText}</span></p>
          {bar && (
            <div class="range" role="img" aria-label={t("rangeAria").replace("{min}", rupees(bar.min)).replace("{modal}", rupees(bar.modal)).replace("{max}", rupees(bar.max))}>
              <div class="range-track"><span class="range-dot" style={{ left: `${bar.modalPct}%` }} /></div>
              <div class="range-ends"><span>{t("low")} {rupees(bar.min)}</span><span>{t("high")} {rupees(bar.max)}</span></div>
            </div>
          )}
          <ReadAloud text={priceSpeech({ cropHi: commodityHi(row.commodity), modal: row.modal_price, market: row.market, dateHi: shortDate(row.arrival_date, "hi"), snapshot: !!res?.snapshot })} />
        </>
      )}
      <p class="hero-links"><a class="btn ghost" href="#/farmer/mandi">{t("otherPrices")}</a></p>
    </section>
  );
}

/** "आज खेत में क्या करें": one sentence, then the next 4 days. */
function TodayCard({ profile }: { profile: FarmerProfile }) {
  const w = useWeather(profile.placeId);
  const now = todayIso();
  const irr = profile.irr;
  const known = /^\d{4}-\d{2}-\d{2}$/.test(irr.lastWatered) && irr.lastWatered <= now;
  const result = w && known ? advise({ crop: irr.crop, soil: irr.soil, stage: irr.stage, areaAcres: irr.areaAcres, lastWatered: irr.lastWatered, today: now, days: w.value }) : null;
  const line = result ? adviceLine(result) : null;
  return (
    <section class="today-card" aria-labelledby="today-h">
      <h2 id="today-h">{t("todayInField")}</h2>
      {w === undefined && <p>{t("weatherLoading")}</p>}
      {w === null && <p>{t("weatherNone")}</p>}
      {w && !known && <p><a class="btn ghost" href="#/farmer/irrigation"><Icon name="drop" size={22} />{t("tellLastWatered")}</a></p>}
      {line && (
        <>
          <p class="advice-main"><Icon name={line.icon} size={36} />{tk(line.key)}</p>
          {line.days != null && <p>{t("nextWaterIn").replace("{n}", String(line.days))}</p>}
          <p class="small">{cropName(irr.crop, getLang())} · <a href="#/farmer/irrigation">{t("change")}</a></p>
          <ReadAloud text={adviceSpeech(tk(line.key), line.days)} />
        </>
      )}
      {w && <DayStrip days={w.value.filter(d => d.date >= now).slice(0, 4)} showEt0={false} />}
    </section>
  );
}

function Home({ profile }: { profile: FarmerProfile }) {
  const place = placeById(profile.placeId)!;
  return (
    <main class="screen" id="main">
      <p class="place-line"><Icon name="pin" size={22} /><span>{tx(place)}</span> <a class="btn ghost small-btn" href="#/farmer/setup">{t("changePlace")}</a></p>
      <CropHero profile={profile} />
      <TodayCard profile={profile} />
      <div class="tiles tiles-6">
        <Tile href="/farmer/weather" icon="weather" label={t("weather")} tone="blue" />
        <Tile href="/farmer/irrigation" icon="drop" label={t("irrigation")} tone="blue" />
        <Tile href="/farmer/leaf" icon="leaf" label={t("leaf")} tone="green" />
        <Tile href="/farmer/schemes" icon="doc" label={t("schemes")} tone="amber" />
        <Tile href="/farmer/calendar" icon="calendar" label={t("calendar")} tone="earth" />
        <Tile href="/farmer/about" icon="info" label={t("about")} tone="plain" />
      </div>
    </main>
  );
}

export function FarmerView({ path }: { path: string }) {
  const [profile, setProfile] = useProfile();
  if (profile === undefined) return <p class="screen">{t("loading")}</p>;
  if (path === "/farmer/about") return <AboutScreen back="/farmer" />;
  if (!profile || path === "/farmer/setup") {
    return <Setup profile={profile} onSave={async p => { await setProfile(p); location.hash = "/farmer"; }} />;
  }
  const place = placeById(profile.placeId);
  switch (path) {
    case "/farmer/mandi": return <MandiScreen worker={false} placeId={profile.placeId} crops={profile.crops} back="/farmer" />;
    case "/farmer/weather": return <WeatherScreen placeId={profile.placeId} pickPlace={false} back="/farmer" />;
    case "/farmer/irrigation":
      return <IrrigationScreen placeId={profile.placeId} pickPlace={false} prefs={profile.irr} back="/farmer"
        onPrefs={irr => setProfile({ ...profile, irr })} />;
    case "/farmer/leaf": return <LeafScreen back="/farmer" />;
    case "/farmer/schemes": return <SchemesScreen back="/farmer" />;
    case "/farmer/calendar": return <CalendarScreen crops={profile.crops} state={place?.state} back="/farmer" />;
    default: return <Home profile={profile} />;
  }
}

export function NotFound() {
  return (
    <Screen title={t("notFound")} back="/">
      <p><a class="btn primary" href="#/">{t("goHome")}</a></p>
    </Screen>
  );
}
