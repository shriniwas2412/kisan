// Admin accounts are created by the operator, never through the open API.
// Used by scripts/create-admin.ts (local database or SQL for D1) and the demo seed.
import type { Env } from "./lib/d1.ts";
import { hashPassword } from "./lib/crypto.ts";
import { ulid } from "../../shared/sync.ts";

export type NewAdmin = { name: string; email: string; password: string };

export async function adminRow(a: NewAdmin, now = Date.now()) {
  const name = a.name.trim(), email = a.email.trim().toLowerCase();
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("a name and a valid email are needed");
  if (a.password.length < 12) throw new Error("the admin password must be 12+ characters");
  const at = new Date(now).toISOString();
  return { id: ulid(now), hlc: at, role: "admin", name, email, password_hash: await hashPassword(a.password), created_at: at };
}

export async function createAdmin(env: Env, a: NewAdmin) {
  const r = await adminRow(a);
  const exists = await env.DB.prepare("SELECT id FROM app_user WHERE email = ?").bind(r.email).first();
  if (exists) throw new Error("an account with this email exists");
  await env.DB.prepare(
    "INSERT INTO app_user (id, hlc, deleted, origin, created_by, role, name, email, password_hash, created_at) VALUES (?, ?, 0, 'operator', NULL, 'admin', ?, ?, ?, ?)",
  ).bind(r.id, r.hlc, r.name, r.email, r.password_hash, r.created_at).run();
  return { id: r.id, name: r.name, email: r.email, role: "admin" };
}

/** One INSERT statement, for `wrangler d1 execute kisan --remote --command "<sql>"`. */
export async function adminSql(a: NewAdmin): Promise<string> {
  const r = await adminRow(a);
  const q = (v: string) => `'${v.replace(/'/g, "''")}'`;
  return "INSERT INTO app_user (id, hlc, deleted, origin, created_by, role, name, email, password_hash, created_at) VALUES (" +
    [r.id, r.hlc].map(q).join(", ") + ", 0, 'operator', NULL, 'admin', " + [r.name, r.email, r.password_hash, r.created_at].map(q).join(", ") + ");";
}
