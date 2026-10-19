import { useEffect, useState } from "preact/hooks";
import { t, setLang, useLang } from "./i18n.ts";
import { FarmerView, NotFound } from "./FarmerView.tsx";
import { WorkerView } from "./WorkerView.tsx";

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

function Choose() {
  return (
    <main class="screen" id="main">
      <h1>{t("chooseView")}</h1>
      <div class="tiles two">
        <a class="tile big" href="#/farmer"><span class="tile-icon" aria-hidden="true">🌾</span><span class="tile-label">{t("iAmFarmer")}</span></a>
        <a class="tile big" href="#/fw"><span class="tile-icon" aria-hidden="true">📋</span><span class="tile-label">{t("iAmWorker")}</span></a>
      </div>
    </main>
  );
}

export function App() {
  const lang = useLang();
  const path = useHash();
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  let view;
  if (path === "/") view = <Choose />;
  else if (path.startsWith("/farmer")) view = <FarmerView path={path} />;
  else if (path.startsWith("/fw")) view = <WorkerView path={path} />;
  else view = <NotFound />;
  return (
    <div class="app" key={lang}>
      <a class="skip" href="#main">Skip</a>
      <header class="top">
        <a class="brand" href="#/"><img src="icon.svg" alt="" width="32" height="32" /> {t("appName")}</a>
        <button type="button" class="btn ghost small-btn" onClick={() => setLang(lang === "hi" ? "en" : "hi")} lang={lang === "hi" ? "en" : "hi"}>
          {t("langToggle")}
        </button>
      </header>
      {view}
    </div>
  );
}
