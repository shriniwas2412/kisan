// What leaves the phone. A farmer's record (and their visits and leaf checks) is sent
// to the team server only if one of their consent rows says scope_sync = 1. Demo rows
// never leave the phone. Deleting clears personal fields locally, and a deleted record
// from the server replaces the local copy.
import { mergeRecord, type SyncRecord } from "../../../shared/sync.ts";
import { NOT_NULL_BLANK, PERSONAL } from "../../../shared/schema.ts";
import { isDemoId } from "./demo.ts";

type Row = Record<string, unknown>;

export function pushPlan(keys: string[], get: (key: string) => Row | undefined, consents: Row[]): { push: string[]; keptLocal: string[] } {
  const syncOk = new Set(consents.filter(c => c.subject_type === "farmer" && Number(c.scope_sync) === 1).map(c => String(c.subject_id)));
  const push: string[] = [], keptLocal: string[] = [];
  for (const key of keys) {
    const [table, id = ""] = key.split(":");
    if (isDemoId(id)) continue;
    const r = get(key);
    let subject: string | null = null;
    if (table === "farmer") subject = id;
    else if (table === "consent") subject = r?.subject_type === "farmer" ? String(r.subject_id) : null;
    else if (table === "visit" || table === "leaf_check") subject = r?.farmer_id ? String(r.farmer_id) : null;
    (subject === null || syncOk.has(subject) ? push : keptLocal).push(key);
  }
  return { push, keptLocal };
}

/** Fields to save when deleting a row: deleted=1 and every personal column cleared. */
export function tombstoneFields(table: "farmer" | "visit" | "leaf_check"): Row {
  const out: Row = { deleted: 1 };
  for (const k of PERSONAL[table]) out[k] = (NOT_NULL_BLANK[table] ?? []).includes(k) ? "" : null;
  return out;
}

export function applyRemote(local: SyncRecord | undefined, remote: SyncRecord): SyncRecord {
  return Number(remote.deleted) ? remote : mergeRecord(local, remote);
}
