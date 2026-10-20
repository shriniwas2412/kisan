// Farmer's own view: no login, Hindi by default, big tiles, one thing per screen.
import { useEffect, useState } from "preact/hooks";
import { Btn, Notice, Screen, Select, Tile } from "./kit.tsx";
import { getLang, t, tx } from "./i18n.ts";
import { Icon } from "./icons.tsx";
import { snapshotLabel } from "../core/demo.ts";
import { PLACES, placeById } from "../core/places.ts";
import { CALENDAR } from "../core/info.ts";
import { meta, setMeta } from "../data/db.ts";
import { getMandi, type MandiFetched } from "../data/api.ts";
import { rowsFor, rupees, showDate } from "../core/mandi.ts";
import { MandiScreen } from "./MandiScreen.tsx";
import { IrrigationScreen, WeatherScreen, DEFAULT_IRR, type IrrPrefs } from "./WeatherScreen.tsx";
import { LeafScreen } from "./LeafScreen.tsx";
import { CalendarScreen, SchemesScreen } from "./InfoScreens.tsx";

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
  return (
    <Screen title={t("setup")} back={profile ? "/farmer" : "/"}>
      <Select label={t("place")} value={placeId} onChange={setPlace} options={PLACES.map(p => ({ value: p.id, label: tx(p) }))} />
      <h2>{t("crops")}</h2>
      <div class="chips">
        {CALENDAR.map(c => (
          <button type="button" key={c.crop} class={`chip${crops.includes(c.crop) ? " on" : ""}`} aria-pressed={crops.includes(c.crop)} onClick={() => toggle(c.crop)}>
            {tx(c)}
          </button>
        ))}
      </div>
      <Btn onClick={() => onSave({ placeId, crops, commodities: profile?.commodities ?? [], irr: profile?.irr ?? DEFAULT_IRR })}>{t("save")}</Btn>
    </Screen>
  );
}

function Home({ profile }: { profile: FarmerProfile }) {
  const place = placeById(profile.placeId)!;
  const [res, setRes] = useState<MandiFetched | null | undefined>(undefined);
  useEffect(() => { getMandi(place.state, place.district).then(setRes); }, [profile.placeId]);
  const a = res?.value;
  const row = a?.available ? rowsFor(a.records, profile.commodities)[0] : undefined;
  return (
    <main class="screen" id="main">
      <p class="place-line"><Icon name="pin" size={22} /><span>{tx(place)}</span> <a class="btn ghost small-btn" href="#/farmer/setup">{t("changePlace")}</a></p>
      <a class="hero" href="#/farmer/mandi">
        <span class="hero-label"><Icon name="rupee" size={26} />{row && !res?.snapshot && row.arrival_date === todayIso() ? t("todayRate") : t("mandiRate")}</span>
        {res === undefined && <span class="hero-sub">{t("loading")}</span>}
        {res !== undefined && !row && <span class="hero-sub">{t("mandiNone")}</span>}
        {row && (
          <>
            <span class="hero-price">{rupees(row.modal_price)} <span class="unit">{t("perQuintal")}</span></span>
            <span class="hero-sub">{row.commodity} · {row.market}</span>
            <span class={`hero-date${res?.snapshot || a?.available && a.stale ? " old" : ""}`}>
              {res?.snapshot ? snapshotLabel(row.arrival_date, getLang()) : `${t("asOf")} ${showDate(row.arrival_date)}`}
            </span>
          </>
        )}
      </a>
      <div class="tiles">
        <Tile href="/farmer/weather" icon="weather" label={t("weather")} />
        <Tile href="/farmer/irrigation" icon="drop" label={t("irrigation")} />
        <Tile href="/farmer/leaf" icon="leaf" label={t("leaf")} />
        <Tile href="/farmer/schemes" icon="doc" label={t("schemes")} />
        <Tile href="/farmer/calendar" icon="calendar" label={t("calendar")} />
      </div>
    </main>
  );
}

export function FarmerView({ path }: { path: string }) {
  const [profile, setProfile] = useProfile();
  if (profile === undefined) return <p class="screen">{t("loading")}</p>;
  if (!profile || path === "/farmer/setup") {
    return <Setup profile={profile} onSave={async p => { await setProfile(p); location.hash = "/farmer"; }} />;
  }
  const place = placeById(profile.placeId);
  switch (path) {
    case "/farmer/mandi":
      return <MandiScreen worker={false} placeId={profile.placeId} picked={profile.commodities} back="/farmer"
        onPick={c => setProfile({ ...profile, commodities: c })} />;
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
  return <Screen title="404" back="/"><Notice kind="warn">?</Notice></Screen>;
}
