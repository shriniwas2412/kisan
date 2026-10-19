import { Notice, Screen } from "./kit.tsx";
import { t, tx } from "./i18n.ts";
import { SCHEMES, calendarFor } from "../core/info.ts";
import { showDate } from "../core/mandi.ts";

export function SchemesScreen({ back }: { back: string }) {
  return (
    <Screen title={t("schemes")} back={back}>
      <p class="small">{t("schemesNote")}</p>
      {SCHEMES.map(s => (
        <article class="card" key={s.id}>
          <h2>{tx(s.name)}</h2>
          <p>{tx(s.what)}</p>
          {s.helpline && <p><a class="btn ghost" href={`tel:${s.helpline.replace(/-/g, "")}`}>📞 {s.helpline}</a></p>}
          <p><a class="btn ghost" href={s.url} target="_blank" rel="noopener">{t("officialSite")} ↗</a></p>
          <p class="small">{t("verifiedOn")}: {showDate(s.last_verified)}</p>
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
          <p class="small">{t("source")}: <a href={e.source} target="_blank" rel="noopener">{e.source_name}</a> · {t("verifiedOn")} {showDate(e.last_verified)}</p>
        </article>
      ))}
      <p class="small">{t("calendarNote")}</p>
    </Screen>
  );
}
