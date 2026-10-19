// Client-side view of /api/mandi answers. Agmarknet rows and prices typed in by a
// field worker are kept apart and labelled differently; nothing is averaged across them.

export type MandiRow = {
  state: string; district: string; market: string; commodity: string; variety: string; grade: string;
  arrival_date: string; min_price: number | null; max_price: number | null; modal_price: number;
};
export type MandiAnswer =
  | { available: true; stale: boolean; source: "agmarknet"; unit: string; as_of: string | null; fetched_at: string;
      total: number | null; truncated: boolean; records: MandiRow[] }
  | { available: false; reason: string };

export type ManualPrice = {
  id: string; market: string; district?: string | null; state?: string | null; commodity: string; variety?: string | null;
  min_rs_q?: number | null; max_rs_q?: number | null; modal_rs_q: number; observed_on: string; source?: string;
};

export type Freshness = "today" | "older" | "stale" | "none";

/** today: fresh from Agmarknet and dated today; older: fresh fetch but the latest report is older;
 *  stale: the server could not reach Agmarknet and is showing its last snapshot. */
export function freshness(a: MandiAnswer | null, todayIso: string): Freshness {
  if (!a || !a.available || !a.records.length) return "none";
  if (a.stale) return "stale";
  return a.as_of === todayIso ? "today" : "older";
}

/** Commodity names exactly as the API wrote them, for the picker. */
export function commoditiesIn(rows: MandiRow[]): string[] {
  return [...new Set(rows.map(r => r.commodity))].sort((a, b) => a.localeCompare(b));
}

/** Rows for the chosen commodities, newest report first, then by market. */
export function rowsFor(rows: MandiRow[], commodities: string[]): MandiRow[] {
  const want = new Set(commodities);
  return rows.filter(r => !want.size || want.has(r.commodity))
    .sort((a, b) => b.arrival_date.localeCompare(a.arrival_date) || a.market.localeCompare(b.market));
}

export function manualFor(list: ManualPrice[], commodities: string[], district?: string): ManualPrice[] {
  const want = new Set(commodities.map(c => c.toLowerCase()));
  return list.filter(m => (!want.size || want.has(m.commodity.toLowerCase())) && (!district || !m.district || m.district === district))
    .sort((a, b) => b.observed_on.localeCompare(a.observed_on));
}

/** "2026-10-19" -> "19/10/2026", the way Agmarknet and farmers write dates. */
export function showDate(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

export function rupees(n: number | null | undefined): string {
  return n == null ? "—" : `₹${Math.round(n).toLocaleString("en-IN")}`;
}
