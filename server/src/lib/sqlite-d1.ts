// D1-compatible wrapper over node:sqlite, for tests and the plain-Node local server.
// Not used on Cloudflare (there the real D1 binding is passed in).
import { DatabaseSync, type StatementSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import type { D1Database, D1PreparedStatement, D1Result } from "./d1.ts";

type Value = null | number | bigint | string | Uint8Array;
const toValue = (v: unknown): Value => (v === undefined || typeof v === "boolean" ? (v === undefined ? null : Number(v)) : (v as Value));

class Stmt implements D1PreparedStatement {
  private db: DatabaseSync; private sql: string; private args: Value[];
  constructor(db: DatabaseSync, sql: string, args: Value[] = []) { this.db = db; this.sql = sql; this.args = args; }
  bind(...values: unknown[]) { return new Stmt(this.db, this.sql, values.map(toValue)); }
  private prepared(): StatementSync { return this.db.prepare(this.sql); }
  async first<T>() { return (this.prepared().get(...this.args) as T | undefined) ?? null; }
  async all<T>() { return { results: this.prepared().all(...this.args) as T[] }; }
  async run(): Promise<D1Result> {
    const r = this.prepared().run(...this.args);
    return { results: [], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }
}

export function sqliteD1(path = ":memory:", migrationsDir?: URL): D1Database & { raw: DatabaseSync } {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON"); // D1 enforces foreign keys
  if (migrationsDir) {
    // Apply each migration once, tracked by name like wrangler's d1_migrations table.
    db.exec("CREATE TABLE IF NOT EXISTS d1_migrations (name TEXT PRIMARY KEY, applied_at TEXT)");
    const done = new Set((db.prepare("SELECT name FROM d1_migrations").all() as { name: string }[]).map(r => r.name));
    for (const f of readdirSync(migrationsDir).filter(f => f.endsWith(".sql")).sort()) {
      if (done.has(f)) continue;
      db.exec(readFileSync(new URL(f, migrationsDir), "utf8"));
      db.prepare("INSERT INTO d1_migrations (name, applied_at) VALUES (?, ?)").run(f, new Date().toISOString());
    }
  }
  return {
    raw: db,
    prepare: (sql: string) => new Stmt(db, sql),
    async batch(statements: D1PreparedStatement[]) {
      // D1 runs a batch as one transaction; do the same.
      db.exec("BEGIN");
      try {
        const out: D1Result[] = [];
        for (const s of statements) out.push(await s.run());
        db.exec("COMMIT");
        return out;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  };
}
