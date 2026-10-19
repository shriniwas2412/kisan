// Small UI kit. Every control is at least 48 px tall; text starts at 18 px.
import type { ComponentChildren, JSX } from "preact";
import { t, type Key } from "./i18n.ts";

export function go(path: string) { location.hash = path; }

export function Screen({ title, back, children }: { title: string; back?: string; children: ComponentChildren }) {
  return (
    <main class="screen" id="main">
      <div class="screen-head">
        {back !== undefined && <a class="btn ghost back" href={`#${back}`}>← {t("back")}</a>}
        <h1>{title}</h1>
      </div>
      {children}
    </main>
  );
}

export function Tile({ href, icon, label, sub }: { href: string; icon: string; label: string; sub?: string }) {
  return (
    <a class="tile" href={`#${href}`}>
      <span class="tile-icon" aria-hidden="true">{icon}</span>
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

export function Badge({ kind, children }: { kind: "gov" | "manual" | "warn" | "ok"; children: ComponentChildren }) {
  return <span class={`badge ${kind}`}>{children}</span>;
}

type FieldProps = { label: string; error?: boolean; hint?: string; children: ComponentChildren };
export function Field({ label, error, hint, children }: FieldProps) {
  return (
    <label class={`field${error ? " has-error" : ""}`}>
      <span class="field-label">{label}{hint && <span class="hint"> ({hint})</span>}</span>
      {children}
    </label>
  );
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
