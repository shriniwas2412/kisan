// Client for data.gov.in "Current Daily Price of Various Commodities from Various
// Markets (Mandi)" (Agmarknet). Prices are Rs./Quintal as published. Rows with a
// missing or non-numeric modal price are dropped, never filled in.

export const RESOURCE_ID = "9ef84268-d588-465a-a308-a864a43d0070";
export const BASE_URL = `https://api.data.gov.in/resource/${RESOURCE_ID}`;
export const UNIT = "Rs./Quintal";

export type MandiQuery = { state: string; district?: string; commodity?: string };

export type MandiRow = {
  state: string; district: string; market: string; commodity: string; variety: string; grade: string;
  arrival_date: string; // ISO yyyy-mm-dd
  min_price: number | null; max_price: number | null; modal_price: number;
};

export type MandiPage = { total: number | null; updated_date: string | null; records: MandiRow[]; dropped: number };

export function buildUrl(apiKey: string, q: MandiQuery, limit: number, offset = 0): string {
  const p = new URLSearchParams({ "api-key": apiKey, format: "json", offset: String(offset), limit: String(limit) });
  // The state filter must be state.keyword (exact match); the others are plain fields.
  p.set("filters[state.keyword]", q.state);
  if (q.district) p.set("filters[district]", q.district);
  if (q.commodity) p.set("filters[commodity]", q.commodity);
  return `${BASE_URL}?${p}`;
}

/** "19/10/2026" -> "2026-10-19"; anything else -> null. */
export function isoDate(ddmmyyyy: unknown): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(ddmmyyyy ?? "").trim());
  if (!m) return null;
  const [, d, mo, y] = m;
  const date = new Date(`${y}-${mo}-${d}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.getUTCDate() !== Number(d)) return null;
  return `${y}-${mo}-${d}`;
}

function price(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

const str = (v: unknown) => (v == null ? "" : String(v).trim());

/** Parse one API response. Throws if the shape is not what the API returns. */
export function parsePage(json: unknown): MandiPage {
  const j = json as { records?: unknown; total?: unknown; updated_date?: unknown };
  if (!j || !Array.isArray(j.records)) throw new Error("mandi response has no records array");
  const records: MandiRow[] = [];
  let dropped = 0;
  for (const r of j.records as Record<string, unknown>[]) {
    const modal = price(r.modal_price);
    const date = isoDate(r.arrival_date);
    if (modal === null || date === null || !str(r.market) || !str(r.commodity)) { dropped++; continue; }
    records.push({
      state: str(r.state), district: str(r.district), market: str(r.market), commodity: str(r.commodity),
      variety: str(r.variety), grade: str(r.grade), arrival_date: date,
      min_price: price(r.min_price), max_price: price(r.max_price), modal_price: modal,
    });
  }
  const total = Number(j.total);
  return {
    total: Number.isFinite(total) ? total : null,
    updated_date: typeof j.updated_date === "string" ? j.updated_date : null,
    records,
    dropped,
  };
}

/** The newest arrival date among the rows: the date the prices are "as of". */
export function asOf(rows: MandiRow[]): string | null {
  let max: string | null = null;
  for (const r of rows) if (!max || r.arrival_date > max) max = r.arrival_date;
  return max;
}
