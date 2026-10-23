import { useEffect, useState } from "preact/hooks";
import { t, setLang, useLang } from "./i18n.ts";
import { FarmerView, NotFound } from "./FarmerView.tsx";
import { WorkerView } from "./WorkerView.tsx";
import { Icon } from "./icons.tsx";
import { clearDemo, isDemoLoaded, loadDemo, meta, onChange } from "../data/db.ts";
import { DEMO_BUILD } from "../data/api.ts";
import { currentMode, enterDemo } from "../data/demoMode.ts";
import { Tour } from "./Tour.tsx";

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

function useHash() {
  const read = () => location.hash.replace(/^#/, "") || "/";
  const [h, setH] = useState(read());
  useEffect(() => {
    const on = () => { setH(read()); window.scrollTo(0, 0); };
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  return h;
}

/** Demo state; the hosted demo build loads the demo once on first open. */
function useDemo() {
  // The banner shows from the first paint in demo mode, even while the demo is still being written.
  const [on, setOn] = useState(currentMode(DEMO_BUILD) === "demo");
  useEffect(() => {
    const check = () => isDemoLoaded().then(l => setOn(l || currentMode(DEMO_BUILD) === "demo"));
    (async () => {
      if (currentMode(DEMO_BUILD) === "demo" && !(await isDemoLoaded())) await loadDemo(today());
      check();
    })();
    return onChange(check);
  }, []);
  return on;
}

function DemoBanner() {
  const [tour, setTour] = useState(false);
  return (
    <div class="demo-banner" role="note">
      <p><b>Demo / नमूना</b> · {t("demoBannerWhy")}</p>
      <button type="button" class="btn ghost small-btn" onClick={() => setTour(true)}>{t("tourStart")}</button>
      <button type="button" class="btn ghost small-btn" onClick={() => clearDemo()}>{t("demoClear")}</button>
      {tour && <Tour onClose={() => setTour(false)} />}
    </div>
  );
}

function Choose({ demo }: { demo: boolean }) {
  return (
    <main class="screen" id="main">
      <h1>{t("chooseView")}</h1>
      <p class="small">{t("tagline")}</p>
      <div class="tiles two">
        <a class="tile big" href="#/farmer"><span class="tile-icon"><Icon name="farmer" size={48} /></span><span class="tile-label">{t("iAmFarmer")}</span><span class="tile-sub">{t("farmerSub")}</span></a>
        <a class="tile big" href="#/fw"><span class="tile-icon"><Icon name="clipboard" size={48} /></span><span class="tile-label">{t("iAmWorker")}</span><span class="tile-sub">{t("workerSub")}</span></a>
      </div>
      {!demo && (
        <section class="card demo-cta">
          <p>{t("demoWhat")}</p>
          <button type="button" class="btn ghost" onClick={() => enterDemo()}><Icon name="play" size={22} />{t("demoTry")}</button>
        </section>
      )}
    </main>
  );
}

export function App() {
  const lang = useLang();
  const path = useHash();
  const demo = useDemo();
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  let view;
  if (path === "/") view = <Choose demo={demo} />;
  else if (path.startsWith("/farmer")) view = <FarmerView path={path} />;
  else if (path.startsWith("/fw")) view = <WorkerView path={path} />;
  else view = <NotFound />;
  return (
    <div class="app" key={lang}>
      <a class="skip" href="#main">{t("skip")}</a>
      <header class="top">
        <a class="brand" href="#/"><img src="icon.svg" alt="" width="32" height="32" />{t("appName")}</a>
        <button type="button" class="btn ghost small-btn" onClick={() => setLang(lang === "hi" ? "en" : "hi")} lang={lang === "hi" ? "en" : "hi"}>
          {t("langToggle")}
        </button>
      </header>
      {demo && <DemoBanner />}
      {view}
    </div>
  );
}
