// GET /mandi?state=&district=&commodity=
// Proxy to Agmarknet with a 6 h D1 cache. On upstream failure it serves the last
// good snapshot marked stale with its date. With nothing cached it says so. It
// never makes up, interpolates or carries forward a price as if it were today's.
import { Hono } from "hono";
import type { Env } from "../lib/d1.ts";
import { asOf, buildUrl, parsePage, UNIT, type MandiQuery, type MandiRow } from "../lib/agmarknet.ts";

export const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const UPSTREAM_TIMEOUT_MS = 8000;

export type Deps = { fetch: typeof fetch; now: () => number };

type Snapshot = { records: MandiRow[]; total: number | null; updated_date: string | null };

export type MandiResponse =
  | {
      available: true; stale: boolean; source: "agmarknet"; unit: string;
      as_of: string | null; fetched_at: string; total: number | null; truncated: boolean; records: MandiRow[];
    }
  | { available: false; reason: "no_api_key" | "upstream_error" | "no_records" };

export function cacheKey(q: MandiQuery): string {
  return JSON.stringify([q.state, q.district ?? "", q.commodity ?? ""].map(s => s.trim().toLowerCase()));
}

function clean(v: string | undefined): string | undefined {
  const s = (v ?? "").trim();
  return s ? s.slice(0, 80) : undefined;
}

export function mandiRoutes(deps: Deps) {
  const app = new Hono<{ Bindings: Env }>();

  app.get("/", async c => {
    const state = clean(c.req.query("state"));
    if (!state) return c.json({ error: "state is required" }, 400);
    const q: MandiQuery = { state, district: clean(c.req.query("district")), commodity: clean(c.req.query("commodity")) };
    const key = cacheKey(q);
    const limit = Math.min(Math.max(Number(c.env.MANDI_LIMIT) || 10, 1), 1000);

    const cached = await c.env.DB.prepare("SELECT payload, fetched_at, as_of FROM mandi_cache WHERE key = ?")
      .bind(key).first<{ payload: string; fetched_at: string; as_of: string | null }>();

    const fromCache = (stale: boolean): MandiResponse => {
      const snap = JSON.parse(cached!.payload) as Snapshot;
      return {
        available: true, stale, source: "agmarknet", unit: UNIT, as_of: cached!.as_of, fetched_at: cached!.fetched_at,
        total: snap.total, truncated: snap.total !== null && snap.total > snap.records.length, records: snap.records,
      };
    };

    if (cached && deps.now() - Date.parse(cached.fetched_at) < CACHE_TTL_MS) return c.json(fromCache(false));

    const apiKey = c.env.DATA_GOV_IN_KEY?.trim();
    if (!apiKey) return c.json(cached ? fromCache(true) : ({ available: false, reason: "no_api_key" } as MandiResponse));

    let page;
    try {
      const res = await deps.fetch(buildUrl(apiKey, q, limit), { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
      if (!res.ok) throw new Error(`upstream HTTP ${res.status}`);
      page = parsePage(await res.json());
    } catch (e) {
      // Log without the URL: it carries the API key.
      console.warn("mandi upstream failed:", e instanceof Error ? e.message : "unknown");
      return c.json(cached ? fromCache(true) : ({ available: false, reason: "upstream_error" } as MandiResponse));
    }

    if (!page.records.length) {
      // Nothing reported for this query today. Show the last snapshot with its date, if any.
      return c.json(cached ? fromCache(true) : ({ available: false, reason: "no_records" } as MandiResponse));
    }

    const fetchedAt = new Date(deps.now()).toISOString();
    const snap: Snapshot = { records: page.records, total: page.total, updated_date: page.updated_date };
    const date = asOf(page.records);
    await c.env.DB.prepare(
      "INSERT INTO mandi_cache (key, payload, fetched_at, as_of) VALUES (?, ?, ?, ?) " +
      "ON CONFLICT(key) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at, as_of = excluded.as_of",
    ).bind(key, JSON.stringify(snap), fetchedAt, date).run();

    const body: MandiResponse = {
      available: true, stale: false, source: "agmarknet", unit: UNIT, as_of: date, fetched_at: fetchedAt,
      total: page.total, truncated: page.total !== null && page.total > page.records.length, records: page.records,
    };
    return c.json(body);
  });

  return app;
}
