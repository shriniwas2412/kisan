// Small UI kit. Every control is at least 48 px tall; text starts at 18 px.
import { cloneElement, isValidElement, type ComponentChildren, type JSX } from "preact";
import { useEffect, useState } from "preact/hooks";
import { t, type Key } from "./i18n.ts";
import { Icon, type IconName } from "./icons.tsx";

export function go(path: string) { location.hash = path; }

export function Screen({ title, back, children }: { title: string; back?: string; children: ComponentChildren }) {
  return (
    <main class="screen" id="main">
      <div class="screen-head">
        {back !== undefined && <a class="btn ghost back" href={`#${back}`}><Icon name="back" size={22} />{t("back")}</a>}
        <h1>{title}</h1>
      </div>
      {children}
    </main>
  );
}

export function Tile({ href, icon, label, sub, tone = "plain" }: { href: string; icon: IconName; label: string; sub?: string; tone?: "blue" | "green" | "amber" | "earth" | "plain" }) {
  return (
    <a class={`tile tone-${tone}`} href={`#${href}`}>
      <span class="tile-icon"><Icon name={icon} size={48} /></span>
      <span class="tile-label">{label}</span>
      {sub && <span class="tile-sub">{sub}</span>}
    </a>
  );
}

export function Notice({ kind = "info", title, children }: { kind?: "info" | "warn" | "bad" | "ok"; title?: string; children?: ComponentChildren }) {
  return (
    <div class={`notice ${kind}`} role={kind === "bad" ? "alert" : "status"}>
      {title && <p class="notice-title">{title}</p>}
      {children}
    </div>
  );
}

export function Badge({ kind, children }: { kind: "gov" | "manual" | "warn" | "ok" | "muted"; children: ComponentChildren }) {
  return <span class={`badge ${kind}`}>{children}</span>;
}

type FieldProps = { label: string; error?: string | false; hint?: string; children: ComponentChildren };
let fieldSeq = 0;
/** A labelled control. With an error, the message is shown under it in words (not colour only) and announced. */
export function Field({ label, error, hint, children }: FieldProps) {
  const [id] = useState(() => `f${++fieldSeq}`);
  const control = isValidElement(children)
    ? cloneElement(children, { id, "aria-invalid": error ? true : undefined, "aria-describedby": error ? `${id}-err` : undefined } as Record<string, unknown>)
    : children;
  return (
    <div class={`field${error ? " has-error" : ""}`}>
      <label class="field-label" for={id}>{label}{hint && <span class="hint"> ({hint})</span>}</label>
      {control}
      {error && <p class="field-error" id={`${id}-err`}><Icon name="warn" size={20} />{error}</p>}
    </div>
  );
}

/** After a failed submit, move focus to the first field marked invalid. */
export function focusFirstInvalid() {
  requestAnimationFrame(() => (document.querySelector('[aria-invalid="true"]') as HTMLElement | null)?.focus());
}

export function Select<T extends string>({ value, onChange, options, label }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string;
}) {
  return (
    <Field label={label}>
      <select value={value} onChange={e => onChange((e.target as HTMLSelectElement).value as T)}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Field>
  );
}

export function Btn(props: JSX.ButtonHTMLAttributes<HTMLButtonElement> & { kind?: "primary" | "ghost" | "danger" }) {
  const { kind = "primary", class: cls, ...rest } = props;
  return <button type="button" class={`btn ${kind} ${cls ?? ""}`} {...rest} />;
}

export const tk = (k: string) => t(k as Key);

/** "Name is required" style message from a schema problem, in the current language. */
export function problemText(p: { field: string; code: string }, label?: string): string {
  return `${label ?? p.field} ${tk(`prob_${p.code}`)}`;
}

/** A server sync rejection reason in plain words; field-level reasons keep the field name. */
export function reasonText(reason: string): string {
  if (reason.includes(":")) return reason.split(",").map(r => { const [f, c] = r.split(":"); return problemText({ field: f, code: c }); }).join(", ");
  return tk(`why_${reason}`);
}

// ---- read aloud (Hindi voice only) ----
import { pickHindiVoice } from "../core/speech.ts";

function useHindiVoice(): SpeechSynthesisVoice | null | undefined {
  const [v, setV] = useState<SpeechSynthesisVoice | null | undefined>(undefined);
  useEffect(() => {
    if (!("speechSynthesis" in window)) { setV(null); return; }
    const pick = () => setV(pickHindiVoice(speechSynthesis.getVoices()));
    pick();
    speechSynthesis.addEventListener("voiceschanged", pick);
    const timer = setTimeout(() => setV(cur => cur ?? null), 1500); // some phones never fire voiceschanged
    return () => { speechSynthesis.removeEventListener("voiceschanged", pick); clearTimeout(timer); };
  }, []);
  return v;
}

/** "सुनें" button. Shown only when the phone has a Hindi voice; otherwise a short note. */
export function ReadAloud({ text }: { text: string }) {
  const voice = useHindiVoice();
  if (voice === undefined) return null;
  if (voice === null) return <p class="small">{t("noHindiVoice")}</p>;
  const speak = () => {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voice; u.lang = voice.lang; u.rate = 0.9;
    speechSynthesis.speak(u);
  };
  return <button type="button" class="btn ghost read-aloud" onClick={speak}><Icon name="speaker" size={22} />{t("readAloud")}</button>;
}
