// The synced tables (server/migrations/0001_init.sql) as data: column types and rules.
// Used by the server to whitelist and check pushed rows, and by the web app to
// validate onboarding forms and pasted CSV. Unknown values stay null; nothing is filled in.

export type ColType = "text" | "real" | "int" | "json";
export type Col = {
  type: ColType;
  required?: boolean;
  oneOf?: readonly string[];
  pattern?: RegExp;
  min?: number;
  max?: number;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME = /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/;
const BOOL = { type: "int", oneOf: ["0", "1"] } as const;

/** Columns every synced table has. `hlc` is set by the sync layer, not by forms. */
export const BASE: Record<string, Col> = {
  id: { type: "text", required: true, pattern: /^[A-Za-z0-9_-]{1,64}$/ },
  deleted: BOOL,
  origin: { type: "text" },
  created_by: { type: "text" },
};

export const TABLES = {
  farmer: {
    name: { type: "text", required: true },
    phone: { type: "text", pattern: /^\+?[0-9 -]{10,15}$/ },
    village: { type: "text" },
    block: { type: "text" },
    district: { type: "text" },
    state: { type: "text" },
    lat: { type: "real", min: -90, max: 90 },
    lng: { type: "real", min: -180, max: 180 },
    land_acres: { type: "real", min: 0, max: 100000 },
    irrigation_source: { type: "text" },
    crops: { type: "json" },
    language: { type: "text" },
    onboarded_at: { type: "text", pattern: DATE },
    source: { type: "text", oneOf: ["paper", "spreadsheet", "app"] },
    source_ref: { type: "text" },
    notes: { type: "text" },
  },
  consent: {
    subject_type: { type: "text", required: true, oneOf: ["farmer", "elder"] },
    subject_id: { type: "text", required: true },
    given_by: { type: "text", oneOf: ["self", "guardian", "facility"] },
    guardian_name: { type: "text" },
    guardian_relation: { type: "text" },
    method: { type: "text", oneOf: ["paper_signed", "verbal_recorded", "digital"] },
    scope_store: { ...BOOL, required: true },
    scope_sync: { ...BOOL, required: true },
    scope_audio_cloud: BOOL,
    scope_contact_share: BOOL,
    scope_research_aggregate: BOOL,
    language: { type: "text" },
    recorded_at: { type: "text", required: true, pattern: DATETIME },
    evidence_ref: { type: "text" },
    withdrawn_at: { type: "text", pattern: DATETIME },
  },
  visit: {
    farmer_id: { type: "text", required: true },
    visited_on: { type: "text", required: true, pattern: DATE },
    purpose: { type: "text" },
    observations: { type: "text" },
    advice_given: { type: "text" },
    follow_up_on: { type: "text", pattern: DATE },
    source: { type: "text" },
    source_ref: { type: "text" },
  },
  leaf_check: {
    farmer_id: { type: "text" },
    crop: { type: "text" },
    top3: { type: "json" },
    abstained: BOOL,
    checked_at: { type: "text", pattern: DATETIME },
  },
  mandi_price_manual: {
    market: { type: "text", required: true },
    district: { type: "text" },
    state: { type: "text" },
    commodity: { type: "text", required: true },
    variety: { type: "text" },
    min_rs_q: { type: "real", min: 0 },
    max_rs_q: { type: "real", min: 0 },
    modal_rs_q: { type: "real", min: 0, required: true },
    observed_on: { type: "text", required: true, pattern: DATE },
    source: { type: "text", oneOf: ["field_worker"] },
  },
} as const satisfies Record<string, Record<string, Col>>;

export type TableName = keyof typeof TABLES;
export const TABLE_NAMES = Object.keys(TABLES) as TableName[];

export function columnsOf(table: TableName): Record<string, Col> {
  return { ...BASE, ...TABLES[table] };
}

export type Row = Record<string, unknown>;
export type Problem = { field: string; code: "required" | "type" | "enum" | "format" | "range" };

const empty = (v: unknown) => v === undefined || v === null || (typeof v === "string" && v.trim() === "");

/**
 * Coerce one row from strings (CSV / form) or JSON into column types and check the rules.
 * Empty cells become null. Columns not in the table are dropped. Nothing is invented.
 */
export function checkRow(table: TableName, raw: Row): { row: Row; problems: Problem[] } {
  const cols = columnsOf(table);
  const row: Row = {};
  const problems: Problem[] = [];
  for (const [field, col] of Object.entries(cols)) {
    const v = raw[field];
    if (empty(v)) {
      row[field] = null;
      if (col.required) problems.push({ field, code: "required" });
      continue;
    }
    let out: unknown = typeof v === "string" ? v.trim() : v;
    if (col.type === "real" || col.type === "int") {
      const n = typeof out === "number" ? out : Number(out);
      if (!Number.isFinite(n) || (col.type === "int" && !Number.isInteger(n))) {
        problems.push({ field, code: "type" }); row[field] = null; continue;
      }
      if ((col.min !== undefined && n < col.min) || (col.max !== undefined && n > col.max)) {
        problems.push({ field, code: "range" });
      }
      out = n;
    } else if (col.type === "json") {
      if (typeof out === "string") {
        try { out = JSON.parse(out); } catch { problems.push({ field, code: "format" }); row[field] = null; continue; }
      }
    } else {
      out = String(out);
    }
    if (col.oneOf && !col.oneOf.includes(String(out))) problems.push({ field, code: "enum" });
    if (col.pattern && !col.pattern.test(String(out))) problems.push({ field, code: "format" });
    row[field] = out;
  }
  if (table === "farmer" && row.crops != null) {
    const crops = row.crops;
    const ok = Array.isArray(crops) && crops.every(c => c && typeof c === "object" && typeof (c as Row).crop === "string"
      && ((c as Row).season == null || ["kharif", "rabi", "zaid", "perennial"].includes(String((c as Row).season)))
      && ((c as Row).area_acres == null || (typeof (c as Row).area_acres === "number" && ((c as Row).area_acres as number) >= 0)));
    if (!ok) problems.push({ field: "crops", code: "format" });
  }
  return { row, problems };
}

/** True when a consent row allows the subject's record to be stored. */
export function consentAllowsStore(c: Row | undefined | null): boolean {
  return !!c && Number(c.scope_store) === 1 && empty(c.withdrawn_at) && !Number(c.deleted);
}
