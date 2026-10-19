// Paste-from-spreadsheet import. Farmers and their consent rows use the same column
// names as the database (and the onboarding CSV templates). A farmer is accepted only
// with a consent row that allows storing. Problems are reported per line, never fixed.
import { tableToObjects } from "./csv.ts";
import { checkRow, columnsOf, consentAllowsStore, type Problem, type Row } from "../../../shared/schema.ts";

export const FARMER_COLUMNS = Object.keys(columnsOf("farmer")).filter(c => !["deleted", "origin", "created_by"].includes(c));
export const CONSENT_COLUMNS = Object.keys(columnsOf("consent")).filter(c => !["deleted", "origin", "created_by"].includes(c));

export type LineError = { line: number; id: string; name: string; problems: (Problem | { field: "consent"; code: "missing" })[] };
export type ImportResult = { farmers: Row[]; consents: Row[]; rejected: LineError[]; consentErrors: LineError[] };

function lineOffset(text: string, columns: string[]): number {
  const first = text.replace(/^﻿/, "").split(/\r?\n/, 1)[0].toLowerCase();
  return columns.some(c => new RegExp(`(^|[,\\t])\\s*${c}\\s*([,\\t]|$)`).test(first)) ? 2 : 1;
}

export function importFarmers(farmerText: string, consentText: string, existingConsents: Row[] = []): ImportResult {
  const consents: Row[] = [];
  const consentErrors: LineError[] = [];
  const cOff = lineOffset(consentText, CONSENT_COLUMNS);
  tableToObjects(consentText, CONSENT_COLUMNS).forEach((raw, i) => {
    const { row, problems } = checkRow("consent", { deleted: 0, ...raw });
    if (problems.length) consentErrors.push({ line: i + cOff, id: String(raw.id ?? ""), name: "", problems });
    else consents.push(row);
  });
  const allowed = new Set([...existingConsents, ...consents]
    .filter(c => c.subject_type === "farmer" && consentAllowsStore(c)).map(c => String(c.subject_id)));

  const farmers: Row[] = [];
  const rejected: LineError[] = [];
  const fOff = lineOffset(farmerText, FARMER_COLUMNS);
  tableToObjects(farmerText, FARMER_COLUMNS).forEach((raw, i) => {
    const { row, problems } = checkRow("farmer", { deleted: 0, ...raw });
    const all: LineError["problems"] = [...problems];
    if (row.id && !allowed.has(String(row.id))) all.push({ field: "consent", code: "missing" });
    if (all.length) rejected.push({ line: i + fOff, id: String(raw.id ?? ""), name: String(raw.name ?? ""), problems: all });
    else farmers.push(row);
  });
  return { farmers, consents: consents.filter(c => farmers.some(f => f.id === c.subject_id)), rejected, consentErrors };
}
