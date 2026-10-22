import { Icon } from "./icons.tsx";
import { Notice, Screen } from "./kit.tsx";
import { t, tx } from "./i18n.ts";
import { SCHEMES, calendarFor } from "../core/info.ts";
import { shortDate } from "../core/farmView.ts";
import { ABOUT } from "../core/about.ts";
import { getLang } from "./i18n.ts";

export function SchemesScreen({ back }: { back: string }) {
  return (
    <Screen title={t("schemes")} back={back}>
      <p class="small">{t("schemesNote")}</p>
      {SCHEMES.map(s => (
        <article class="card" key={s.id}>
          <h2>{tx(s.name)}</h2>
          <p>{tx(s.what)}</p>
          {s.helpline && <p><a class="btn ghost" href={`tel:${s.helpline.replace(/-/g, "")}`}><Icon name="phone" size={22} />{s.helpline}</a></p>}
          <p><a class="btn ghost" href={s.url} target="_blank" rel="noopener">{t("officialSite")}</a></p>
          <p class="small">{t("verifiedOn")}: {shortDate(s.last_verified, getLang())}</p>
        </article>
      ))}
    </Screen>
  );
}

export function CalendarScreen({ crops, state, back }: { crops?: string[]; state?: string; back: string }) {
  const entries = calendarFor({ crops, state });
  return (
    <Screen title={t("calendar")} back={back}>
      {entries.length === 0 && <Notice kind="warn">{t("calendarNone")}</Notice>}
      {entries.map(e => (
        <article class="card" key={e.crop}>
          <h2>{tx(e)}</h2>
          <p class="small">{t("region")}: {tx(e.region)}</p>
          <ul>{e.windows.map(w => <li key={w.label.en}>{tx(w.label)}</li>)}</ul>
          <p class="small">{t("source")}: <a href={e.source} target="_blank" rel="noopener">{e.source_name}</a> · {t("verifiedOn")} {shortDate(e.last_verified, getLang())}</p>
        </article>
      ))}
      <p class="small">{t("calendarNote")}</p>
    </Screen>
  );
}

export function AboutScreen({ back }: { back: string }) {
  return (
    <Screen title={t("about")} back={back}>
      {ABOUT.map(sec => (
        <section class="card" key={sec.title.en}>
          <h2>{tx(sec.title)}</h2>
          {sec.body.map(b => <p key={b.en}>{tx(b)}</p>)}
          {sec.links && <p class="link-row">{sec.links.map(l => <a key={l.href} href={l.href} target="_blank" rel="noopener" lang="en">{l.label}</a>)}</p>}
        </section>
      ))}
    </Screen>
  );
}
