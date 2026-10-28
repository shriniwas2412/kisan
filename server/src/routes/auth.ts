// Email + password sign-in for field workers and admins. PBKDF2 hashes in app_user,
// a signed JWT in an httpOnly cookie. There is no open sign-up: the operator creates
// the first admin with scripts/create-admin.ts, and only an admin can add accounts.
// Failed sign-ins are rate limited per email and per (hashed) IP address.
import { Hono, type MiddlewareHandler } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { Env } from "../lib/d1.ts";
import { hashPassword, signJwt, verifyJwt, verifyPassword, type Claims } from "../lib/crypto.ts";
import { ulid } from "../../../shared/sync.ts";
import { secretProblem } from "../lib/secret.ts";

export const COOKIE = "kisan_session";
const SESSION_SEC = 7 * 24 * 3600;
const ROLES = ["field_worker", "admin"] as const;
type Vars = { user: Claims };

function secret(env: Env): string {
  const problem = secretProblem(env.JWT_SECRET);
  if (problem) throw new Error(`JWT_SECRET is not usable (${problem}); set 32+ random characters`);
  return env.JWT_SECRET!;
}

// Rate limits: within 15 minutes, 5 failed sign-ins for one email, or 20 failures (sign-in or
// add-account) from one address, make further attempts wait. Answers are a generic 429.
export const WINDOW_MS = 15 * 60 * 1000;
export const MAX_PER_EMAIL = 5;
export const MAX_PER_IP = 20;

async function ipKey(c: { req: { header(n: string): string | undefined } }, env: Env): Promise<string> {
  const ip = c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  // Keyed hash, so the stored value can't be turned back into an address by guessing.
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret(env)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(ip)));
  return "ip:" + Array.from(mac.slice(0, 16), b => b.toString(16).padStart(2, "0")).join("");
}

async function failures(env: Env, key: string, since: number): Promise<number> {
  return (await env.DB.prepare("SELECT COUNT(*) AS n FROM login_attempt WHERE key = ? AND at > ?").bind(key, since).first<{ n: number }>())?.n ?? 0;
}

async function recordFailure(env: Env, keys: string[], at: number) {
  await env.DB.batch([
    ...keys.map(k => env.DB.prepare("INSERT INTO login_attempt (key, at) VALUES (?, ?)").bind(k, at)),
    env.DB.prepare("DELETE FROM login_attempt WHERE at <= ?").bind(at - WINDOW_MS),
  ]);
}

let dummyHash: Promise<string> | null = null;

/** `now` is the app clock, so tokens are checked against the same time they were issued with. */
export function requireUser(roles: readonly string[] = ROLES, now: () => number = Date.now): MiddlewareHandler<{ Bindings: Env; Variables: Vars }> {
  return async (c, next) => {
    const token = getCookie(c, COOKIE);
    const claims = token ? await verifyJwt(token, secret(c.env), Math.floor(now() / 1000)) : null;
    if (!claims) return c.json({ error: "sign in required" }, 401);
    if (!roles.includes(claims.role)) return c.json({ error: "not allowed for this role" }, 403);
    c.set("user", claims);
    await next();
  };
}

type UserRow = { id: string; name: string; email: string; role: string; password_hash: string };

export function authRoutes(now: () => number = Date.now) {
  const app = new Hono<{ Bindings: Env; Variables: Vars }>();

  async function startSession(c: Parameters<MiddlewareHandler<{ Bindings: Env; Variables: Vars }>>[0], u: Omit<UserRow, "password_hash">) {
    const exp = Math.floor(now() / 1000) + SESSION_SEC;
    const token = await signJwt({ sub: u.id, role: u.role, name: u.name, exp }, secret(c.env));
    setCookie(c, COOKIE, token, {
      httpOnly: true, sameSite: "Lax", path: "/", maxAge: SESSION_SEC, secure: c.env.COOKIE_INSECURE !== "1",
    });
  }

  app.post("/register", async c => {
    const body = await c.req.json().catch(() => null) as Record<string, unknown> | null;
    const name = String(body?.name ?? "").trim();
    const email = String(body?.email ?? "").trim().toLowerCase();
    const password = String(body?.password ?? "");
    if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || password.length < 8) {
      return c.json({ error: "name, a valid email and a password of 8+ characters are needed" }, 400);
    }
    const ip = await ipKey(c, c.env);
    if (await failures(c.env, ip, now() - WINDOW_MS) >= MAX_PER_IP) return c.json({ error: "too many attempts, try again later" }, 429);
    const token = getCookie(c, COOKIE);
    const claims = token ? await verifyJwt(token, secret(c.env), Math.floor(now() / 1000)) : null;
    if (claims?.role !== "admin") {
      await recordFailure(c.env, [ip], now());
      return c.json({ error: "only an admin can add accounts" }, 403);
    }
    const role = ROLES.includes(body?.role as never) ? String(body!.role) : "field_worker";
    const exists = await c.env.DB.prepare("SELECT id FROM app_user WHERE email = ?").bind(email).first();
    if (exists) return c.json({ error: "an account with this email exists" }, 409);
    const id = ulid(now());
    const at = new Date(now()).toISOString();
    await c.env.DB.prepare(
      "INSERT INTO app_user (id, hlc, deleted, origin, created_by, role, name, email, password_hash, created_at) VALUES (?, ?, 0, 'server', ?, ?, ?, ?, ?, ?)",
    ).bind(id, at, null, role, name, email, await hashPassword(password), at).run();
    return c.json({ user: { id, name, email, role } }, 201);
  });

  app.post("/login", async c => {
    const body = await c.req.json().catch(() => null) as Record<string, unknown> | null;
    const email = String(body?.email ?? "").trim().toLowerCase();
    const emailKey = "email:" + email, ip = await ipKey(c, c.env), since = now() - WINDOW_MS;
    if (await failures(c.env, emailKey, since) >= MAX_PER_EMAIL || await failures(c.env, ip, since) >= MAX_PER_IP) {
      return c.json({ error: "too many attempts, try again later" }, 429);
    }
    const u = await c.env.DB.prepare("SELECT id, name, email, role, password_hash FROM app_user WHERE email = ? AND deleted = 0")
      .bind(email).first<UserRow>();
    // Same message and about the same time for an unknown email and a wrong password.
    dummyHash ??= hashPassword("not-a-real-password");
    const ok = await verifyPassword(String(body?.password ?? ""), u?.password_hash ?? await dummyHash);
    if (!u || !ok || !ROLES.includes(u.role as never)) {
      await recordFailure(c.env, [emailKey, ip], now());
      return c.json({ error: "email or password is wrong" }, 401);
    }
    await c.env.DB.prepare("DELETE FROM login_attempt WHERE key = ?").bind(emailKey).run();
    const { password_hash: _, ...user } = u;
    await startSession(c, user);
    return c.json({ user });
  });

  app.post("/logout", c => {
    deleteCookie(c, COOKIE, { path: "/" });
    return c.json({ ok: true });
  });

  app.get("/me", requireUser(ROLES, now), c => {
    const u = c.get("user");
    return c.json({ user: { id: u.sub, name: u.name, role: u.role } });
  });

  return app;
}
