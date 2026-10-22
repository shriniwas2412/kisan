import { createApp } from "../src/app.ts";
import { sqliteD1 } from "../src/lib/sqlite-d1.ts";
import type { Env } from "../src/lib/d1.ts";

export const SECRET = "k7Qp2vX9mR4tL8wZ1nB6cY3hF5jD0sGa";
let lastEnv: Env | undefined;

export function setup(opts: { key?: string; fetch?: typeof fetch; now?: () => number } = {}) {
  const env: Env = {
    DB: sqliteD1(":memory:", new URL("../migrations/", import.meta.url)),
    JWT_SECRET: SECRET,
    DATA_GOV_IN_KEY: opts.key,
    MANDI_LIMIT: "10",
  };
  let t = Date.parse("2026-10-19T10:00:00Z");
  const clock = { now: opts.now ?? (() => t), set: (iso: string) => { t = Date.parse(iso); } };
  const calls: string[] = [];
  const fetchImpl = opts.fetch ?? (async () => { throw new Error("no network in tests"); });
  const app = createApp({ fetch: (async (url: string, init?: RequestInit) => { calls.push(String(url)); return fetchImpl(url, init); }) as typeof fetch, now: clock.now });
  const req = (path: string, init: RequestInit = {}, cookie?: string) => app.request(path, {
    ...init,
    headers: { ...(init.body ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}), ...(init.headers as object) },
  }, env);
  lastEnv = env;
  return { app, env, req, clock, calls };
}

/** Admins are created only by the operator (script), never by an open sign-up. */
export async function signIn(req: ReturnType<typeof setup>["req"], email = "admin@test.example", password = "test-password-1", env?: Env) {
  const { createAdmin } = await import("../src/admin.ts");
  await createAdmin(env ?? lastEnv!, { name: "Test Admin", email, password }).catch(() => {});
  const res = await req("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
  const cookie = (res.headers.get("set-cookie") ?? "").split(";")[0];
  return cookie;
}
