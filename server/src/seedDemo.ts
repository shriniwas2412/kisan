// Creates the demo admin and demo field-worker accounts through the normal API,
// so the same rules apply (first account = admin, later ones added by the admin).
import { createApp } from "./app.ts";
import type { Env } from "./lib/d1.ts";

export type DemoAccounts = { adminEmail: string; workerEmail: string; password: string };

export async function seedDemo(env: Env, a: DemoAccounts): Promise<string[]> {
  if (a.password.length < 8) throw new Error("DEMO_PASSWORD must be 8+ characters");
  const app = createApp();
  const json = { "content-type": "application/json" };
  const call = (path: string, body: unknown, cookie = "") =>
    app.request(path, { method: "POST", headers: { ...json, ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) }, env);
  const done: string[] = [];

  const reg = await call("/api/auth/register", { name: "Demo Admin", email: a.adminEmail, password: a.password });
  if (reg.status === 201) done.push(`created admin ${a.adminEmail}`);
  const login = await call("/api/auth/login", { email: a.adminEmail, password: a.password });
  if (login.status !== 200) throw new Error("could not sign in as the demo admin (an older admin with another password may exist)");
  const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];

  const w = await call("/api/auth/register", { name: "Demo Field Worker", email: a.workerEmail, password: a.password, role: "field_worker" }, cookie);
  if (w.status === 201) done.push(`created field worker ${a.workerEmail}`);
  else if (w.status !== 409) throw new Error(`could not create the field worker (HTTP ${w.status})`);
  return done.length ? done : ["demo accounts already exist"];
}
