// POST /sync  { since, changes: { <table>: SyncRecord[] } }
// Push: each record is merged field by field (LWW map) with what the server has,
// checked against the schema, and stored. A farmer is stored only if a consent row
// with scope_store=1 exists for them (already on the server or in the same push).
// Pull: every row changed after the `since` cursor (a server sequence number).
import { Hono } from "hono";
import type { D1Database, Env } from "../lib/d1.ts";
import { requireUser } from "./auth.ts";
import type { Claims } from "../lib/crypto.ts";
import { checkRow, columnsOf, consentAllowsStore, TABLES, TABLE_NAMES, type TableName, type Row } from "../../../shared/schema.ts";
import { decode, mergeRecord, recordStamp, type SyncRecord } from "../../../shared/sync.ts";

const MAX_PUSH = 500;
const MAX_PULL = 1000;
const MAX_CLOCK_AHEAD_MS = 24 * 3600 * 1000;
// Order matters: consent before the farmers it covers, farmers before their visits.
const PUSH_ORDER: TableName[] = ["consent", "farmer", "visit", "leaf_check", "mandi_price_manual"];

export type Rejected = { table: string; id: string; reason: string };

const jsonCols = (t: TableName) => Object.entries(TABLES[t]).filter(([, c]) => c.type === "json").map(([k]) => k);

function fromDb(t: TableName, r: Row): SyncRecord {
  const out: SyncRecord = { id: String(r.id) };
  for (const k of Object.keys(columnsOf(t))) {
    if (k === "id") continue;
    let v = r[k];
    if (v != null && jsonCols(t).includes(k)) { try { v = JSON.parse(String(v)); } catch { /* keep text */ } }
    out[k] = v ?? null;
  }
  out._v = r.field_hlc ? JSON.parse(String(r.field_hlc)) : {};
  return out;
}

async function load(db: D1Database, t: TableName, id: string): Promise<SyncRecord | undefined> {
  const r = await db.prepare(`SELECT * FROM ${t} WHERE id = ?`).bind(id).first<Row>();
  return r ? fromDb(t, r) : undefined;
}

function validStamps(r: SyncRecord, now: number): boolean {
  if (!r._v || typeof r._v !== "object") return false;
  for (const ts of Object.values(r._v)) {
    if (typeof ts !== "string" || ts.length > 80) return false;
    const { wall } = decode(ts);
    if (!Number.isFinite(wall) || wall > now + MAX_CLOCK_AHEAD_MS) return false;
  }
  return true;
}

export function syncRoutes(now: () => number = Date.now) {
  const app = new Hono<{ Bindings: Env; Variables: { user: Claims } }>();
  app.use("*", requireUser());

  app.post("/", async c => {
    const db = c.env.DB;
    const user = c.get("user");
    const body = await c.req.json().catch(() => null) as { since?: unknown; changes?: Record<string, unknown> } | null;
    if (!body || typeof body !== "object") return c.json({ error: "bad body" }, 400);
    const changes = body.changes ?? {};
    const total = Object.values(changes).reduce<number>((s, l) => s + (Array.isArray(l) ? l.length : 0), 0);
    if (total > MAX_PUSH) return c.json({ error: `push at most ${MAX_PUSH} records at a time` }, 413);

    const rejected: Rejected[] = [];
    let accepted = 0;
    for (const t of PUSH_ORDER) {
      const list = changes[t];
      if (!Array.isArray(list)) continue;
      for (const incoming of list as SyncRecord[]) {
        const id = String(incoming?.id ?? "");
        if (!incoming || typeof incoming !== "object" || !validStamps(incoming, now())) {
          rejected.push({ table: t, id, reason: "bad_stamps" }); continue;
        }
        const existing = await load(db, t, id);
        const merged = mergeRecord(existing, incoming);
        if (!existing) {
          merged.created_by = user.sub;
        } else {
          merged.created_by = existing.created_by;
          if (existing._v?.created_by) merged._v!.created_by = existing._v.created_by; else delete merged._v!.created_by;
        }
        const { row, problems } = checkRow(t, merged);
        if (problems.length) {
          rejected.push({ table: t, id, reason: problems.map(p => `${p.field}:${p.code}`).join(",") }); continue;
        }
        if (t === "farmer" && !Number(row.deleted)) {
          const consents = await db.prepare("SELECT * FROM consent WHERE subject_type = 'farmer' AND subject_id = ? AND deleted = 0")
            .bind(id).all<Row>();
          if (!consents.results.some(consentAllowsStore)) { rejected.push({ table: t, id, reason: "no_consent" }); continue; }
        }
        if (t === "visit" && !(await db.prepare("SELECT id FROM farmer WHERE id = ?").bind(row.farmer_id).first())) {
          rejected.push({ table: t, id, reason: "unknown_farmer" }); continue;
        }
        const cols = Object.keys(row);
        const values = cols.map(k => (row[k] !== null && jsonCols(t).includes(k) ? JSON.stringify(row[k]) : row[k]));
        await db.batch([
          // Upsert, not REPLACE: REPLACE deletes the row first, which D1's foreign keys refuse for a farmer with visits.
          db.prepare(`INSERT INTO ${t} (${cols.join(", ")}, hlc, field_hlc) VALUES (${cols.map(() => "?").join(", ")}, ?, ?) ` +
            `ON CONFLICT(id) DO UPDATE SET ${[...cols.filter(k => k !== "id"), "hlc", "field_hlc"].map(k => `${k} = excluded.${k}`).join(", ")}`)
            .bind(...values, recordStamp(merged) || "0", JSON.stringify(merged._v ?? {})),
          db.prepare("INSERT INTO change_log (tbl, row_id) VALUES (?, ?)").bind(t, id),
        ]);
        accepted++;
      }
    }
    for (const t of Object.keys(changes)) {
      if (!TABLE_NAMES.includes(t as TableName)) rejected.push({ table: t, id: "*", reason: "unknown_table" });
    }

    const since = Number(body.since) || 0;
    const log = await db.prepare(
      "SELECT tbl, row_id, MAX(seq) AS seq FROM change_log WHERE seq > ? GROUP BY tbl, row_id ORDER BY seq LIMIT ?",
    ).bind(since, MAX_PULL + 1).all<{ tbl: TableName; row_id: string; seq: number }>();
    const more = log.results.length > MAX_PULL;
    const entries = log.results.slice(0, MAX_PULL);
    const pulled: Record<string, SyncRecord[]> = {};
    for (const e of entries) {
      const r = await load(db, e.tbl, e.row_id);
      if (r) (pulled[e.tbl] ??= []).push(r);
    }
    const cursor = entries.length ? entries[entries.length - 1].seq : since;
    return c.json({ accepted, rejected, cursor, more, changes: pulled });
  });

  return app;
}
