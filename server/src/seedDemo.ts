// Creates the demo admin (the operator path, as scripts/create-admin.ts does) and
// then the demo field worker through the normal API, signed in as that admin.
import { createApp } from "./app.ts";
import { createAdmin } from "./admin.ts";
import type { Env } from "./lib/d1.ts";

export type DemoAccounts = { adminEmail: string; workerEmail: string; password: string };

export async function seedDemo(env: Env, a: DemoAccounts): Promise<string[]> {
  if (a.password.length < 12) throw new Error("DEMO_PASSWORD must be 12+ characters");
  const app = createApp();
  const json = { "content-type": "application/json" };
  const call = (path: string, body: unknown, cookie = "") =>
    app.request(path, { method: "POST", headers: { ...json, ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) }, env);
  const done: string[] = [];

  const exists = await env.DB.prepare("SELECT id FROM app_user WHERE email = ?").bind(a.adminEmail.trim().toLowerCase()).first();
  if (!exists) { await createAdmin(env, { name: "Demo Admin", email: a.adminEmail, password: a.password }); done.push(`created admin ${a.adminEmail}`); }
  const login = await call("/api/auth/login", { email: a.adminEmail, password: a.password });
  if (login.status !== 200) throw new Error("could not sign in as the demo admin (an older admin with another password may exist)");
  const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];

  const w = await call("/api/auth/register", { name: "Demo Field Worker", email: a.workerEmail, password: a.password, role: "field_worker" }, cookie);
  if (w.status === 201) done.push(`created field worker ${a.workerEmail}`);
  else if (w.status !== 409) throw new Error(`could not create the field worker (HTTP ${w.status})`);
  return done.length ? done : ["demo accounts already exist"];
}
