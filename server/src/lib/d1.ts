// The subset of Cloudflare D1 the server uses. Typed here so the code needs no
// workers-types package; test/sqlite-d1.ts implements it on node:sqlite.

export type D1Result<T = Record<string, unknown>> = { results: T[]; meta?: { changes?: number; last_row_id?: number } };

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}

export interface D1Database {
  prepare(sql: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>;
}

export type Env = {
  DB: D1Database;
  JWT_SECRET?: string;
  DATA_GOV_IN_KEY?: string;
  ALLOWED_ORIGINS?: string;
  MANDI_LIMIT?: string;
  /** "1" only for plain-http local runs; production cookies are always Secure. */
  COOKIE_INSECURE?: string;
};
