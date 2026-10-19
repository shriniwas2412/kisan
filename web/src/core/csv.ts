// Minimal RFC 4180 CSV: quoted fields, escaped quotes, commas and newlines inside quotes.

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", inQuotes = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some(f => f !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some(f => f !== "")) rows.push(row);
  return rows;
}

/** CSV text -> array of objects keyed by the (trimmed, lower-cased) header row. */
export function csvToObjects(text: string): Record<string, string>[] {
  const [header, ...rows] = parseCsv(text);
  if (!header) return [];
  const keys = header.map(h => h.trim().toLowerCase());
  return rows.map(r => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}

function cell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(columns: string[], objects: Record<string, unknown>[]): string {
  const lines = [columns.map(cell).join(",")];
  for (const o of objects) lines.push(columns.map(c => cell(o[c])).join(","));
  return lines.join("\n") + "\n";
}

/**
 * Rows pasted from Excel / Google Sheets (tab-separated) or CSV text, to objects.
 * If the first row is not a header (none of its cells is a known column), the
 * columns are taken to be `columns` in order, matching the CSV template.
 */
export function tableToObjects(text: string, columns: string[]): Record<string, string>[] {
  const firstLine = text.replace(/^﻿/, "").split(/\r?\n/, 1)[0];
  const rows = firstLine.includes("\t")
    ? text.replace(/^﻿/, "").split(/\r?\n/).filter(l => l.trim()).map(l => l.split("\t"))
    : parseCsv(text);
  if (!rows.length) return [];
  const known = new Set(columns);
  const head = rows[0].map(h => h.trim().toLowerCase());
  const hasHeader = head.some(h => known.has(h));
  const keys = hasHeader ? head : columns;
  return rows.slice(hasHeader ? 1 : 0)
    .map(r => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}
