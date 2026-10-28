// POST /sync  { since, changes: { <table>: SyncRecord[] } }
// Push: each record is merged field by field (LWW map) with what the server has,
// checked against the schema, and stored. A farmer (and their visits and leaf checks)
// is stored only if a consent row for them allows storing AND syncing (scope_store=1,
// scope_sync=1), already on the server or in the same push.
// Deleting a farmer or withdrawing their consent erases: the server keeps only a
// tombstone with the personal columns cleared, for the farmer and every visit and
// leaf check, and no later push can undo a withdrawal or bring the record back.
// Pull: every row changed after the `since` cursor (a server sequence number).
import { Hono } from "hono";
import type { D1Database, Env } from "../lib/d1.ts";
import { requireUser } from "./auth.ts";
import type { Claims } from "../lib/crypto.ts";
import { checkRow, columnsOf, consentAllowsStore, consentAllowsSync, NOT_NULL_BLANK, PERSONAL, TABLES, TABLE_NAMES, type TableName, type Row } from "../../../shared/schema.ts";
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

async function writeRow(db: D1Database, t: TableName, row: Row, hlc: string, v: Record<string, string>) {
  const cols = Object.keys(row);
  const values = cols.map(k => (row[k] !== null && jsonCols(t).includes(k) ? JSON.stringify(row[k]) : row[k]));
  await db.batch([
    // Upsert, not REPLACE: REPLACE deletes the row first, which D1's foreign keys refuse for a farmer with visits.
    db.prepare(`INSERT INTO ${t} (${cols.join(", ")}, hlc, field_hlc) VALUES (${cols.map(() => "?").join(", ")}, ?, ?) ` +
      `ON CONFLICT(id) DO UPDATE SET ${[...cols.filter(k => k !== "id"), "hlc", "field_hlc"].map(k => `${k} = excluded.${k}`).join(", ")}`)
      .bind(...values, hlc, JSON.stringify(v)),
    db.prepare("INSERT INTO change_log (tbl, row_id) VALUES (?, ?)").bind(t, String(row.id)),
  ]);
}

/** Keep only id, ids it points to, deleted=1 and stamps; every personal column is cleared. */
async function writeTombstone(db: D1Database, t: "farmer" | "visit" | "leaf_check", rec: SyncRecord, ts: string) {
  const row: Row = {};
  for (const k of Object.keys(columnsOf(t))) row[k] = rec[k] ?? null;
  const v: Record<string, string> = { ...(rec._v ?? {}) };
  for (const k of PERSONAL[t]) { row[k] = (NOT_NULL_BLANK[t] ?? []).includes(k) ? "" : null; v[k] = ts; }
  row.deleted = 1; v.deleted = ts;
  await writeRow(db, t, row, ts, v);
}

async function farmerRow(db: D1Database, id: string) {
  return db.prepare("SELECT id, deleted FROM farmer WHERE id = ?").bind(id).first<{ id: string; deleted: number }>();
}

/** A farmer is erased once deleted on the server or once any of their consents is withdrawn. */
async function isErased(db: D1Database, farmerId: string): Promise<boolean> {
  const f = await farmerRow(db, farmerId);
  if (f && Number(f.deleted)) return true;
  return !!(await db.prepare("SELECT id FROM consent WHERE subject_type = 'farmer' AND subject_id = ? AND withdrawn_at IS NOT NULL")
    .bind(farmerId).first());
}

async function consentProblem(db: D1Database, farmerId: string): Promise<string | null> {
  const consents = (await db.prepare("SELECT * FROM consent WHERE subject_type = 'farmer' AND subject_id = ? AND deleted = 0")
    .bind(farmerId).all<Row>()).results;
  if (consents.some(consentAllowsSync)) return null;
  return consents.some(consentAllowsStore) ? "no_sync_consent" : "no_consent";
}

/** Tombstone the farmer and all their visits and leaf checks, with personal columns cleared. */
async function eraseFarmer(db: D1Database, farmerId: string, ts: string, incoming?: SyncRecord) {
  const now = async (t: TableName, id: string) => load(db, t, id);
  const f = incoming ?? await now("farmer", farmerId);
  if (f) await writeTombstone(db, "farmer", { ...f, id: farmerId }, maxTs(ts, recordStamp(f)));
  for (const t of ["visit", "leaf_check"] as const) {
    const ids = (await db.prepare(`SELECT id FROM ${t} WHERE farmer_id = ?`).bind(farmerId).all<{ id: string }>()).results;
    for (const { id } of ids) {
      const r = await now(t, id);
      if (r) await writeTombstone(db, t, r, maxTs(ts, recordStamp(r)));
    }
  }
}

const maxTs = (a: string, b: string) => (a > b ? a : b);

export function syncRoutes(now: () => number = Date.now) {
  const app = new Hono<{ Bindings: Env; Variables: { user: Claims } }>();
  app.use("*", requireUser(undefined, now));

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
        const stampNow = recordStamp(merged) || "0";

        if (t === "consent" && existing?.withdrawn_at) {
          // Withdrawal is final: a stale or newer phone cannot clear it.
          merged.withdrawn_at = existing.withdrawn_at;
          merged._v!.withdrawn_at = stampNow;
        }
        if (t === "consent" && merged.withdrawn_at) for (const k of PERSONAL.consent) { merged[k] = null; merged._v![k] = stampNow; }

        const subject = t === "farmer" ? id : t === "consent" ? (merged.subject_type === "farmer" ? String(merged.subject_id ?? "") : "")
          : merged.farmer_id ? String(merged.farmer_id) : "";

        if ((t === "visit" || t === "leaf_check") && Number(merged.deleted)) {
          // A deleted child: keep only a tombstone, and only if its farmer is here.
          if (subject && await farmerRow(db, subject)) await writeTombstone(db, t, merged, stampNow);
          accepted++; continue;
        }
        if (t === "farmer" && (Number(merged.deleted) || await isErased(db, id))) {
          if (!Number(merged.deleted)) { rejected.push({ table: t, id, reason: "withdrawn" }); continue; }
          await eraseFarmer(db, id, stampNow, merged);
          accepted++; continue;
        }

        const { row, problems } = checkRow(t, merged);
        if (problems.length) {
          rejected.push({ table: t, id, reason: problems.map(p => `${p.field}:${p.code}`).join(",") }); continue;
        }
        if (t === "consent" && !row.withdrawn_at && !consentAllowsSync(row)) {
          rejected.push({ table: t, id, reason: "no_sync_consent" }); continue;
        }
        if (t === "farmer") {
          const reason = await consentProblem(db, id);
          if (reason) { rejected.push({ table: t, id, reason }); continue; }
        }
        if ((t === "visit" || t === "leaf_check") && subject) {
          const f = await farmerRow(db, subject);
          if (!f) { rejected.push({ table: t, id, reason: "unknown_farmer" }); continue; }
          if (Number(f.deleted) || await isErased(db, subject)) { rejected.push({ table: t, id, reason: "farmer_deleted" }); continue; }
          const reason = await consentProblem(db, subject);
          if (reason) { rejected.push({ table: t, id, reason }); continue; }
        }
        if (t === "visit" && !subject) { rejected.push({ table: t, id, reason: "unknown_farmer" }); continue; }

        await writeRow(db, t, row, stampNow, merged._v ?? {});
        if (t === "consent" && row.withdrawn_at && subject && await farmerRow(db, subject)) await eraseFarmer(db, subject, stampNow);
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
