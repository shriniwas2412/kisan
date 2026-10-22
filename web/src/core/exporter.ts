// The field worker's copy of their records: CSV (farmers, the onboarding template columns)
// or JSON (every table). Deleted rows and internal sync stamps are left out.
import { toCsv } from "./csv.ts";
import { FARMER_COLUMNS } from "./importFarmers.ts";

/** A cell starting with = + - @ (or a tab/CR) would run as a formula in Excel/Sheets; prefix it with '. */
export function safeCell(v: string): string {
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}

type Row = Record<string, unknown>;
const live = (rows: Row[]) => rows.filter(r => !Number(r.deleted));

export function exportFarmersCsv(farmers: Row[]): string {
  const rows = live(farmers).map(f => Object.fromEntries(FARMER_COLUMNS.map(c => {
    const v = f[c];
    const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    return [c, safeCell(s)];
  })));
  return toCsv(FARMER_COLUMNS, rows);
}

export function exportJson(tables: Record<string, Row[]>, at: string): string {
  const out: Record<string, Row[]> = {};
  for (const [t, rows] of Object.entries(tables)) out[t] = live(rows).map(({ _v, ...rest }) => rest);
  return JSON.stringify({ exported_at: at, note: "Kisan export from one phone. Contains personal data: keep it private.", tables: out }, null, 1);
}
