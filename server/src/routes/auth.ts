// Email + password sign-in for field workers and admins. PBKDF2 hashes in app_user,
// a signed JWT in an httpOnly cookie. The first account created becomes admin;
// after that only an admin can add accounts.
import { Hono, type MiddlewareHandler } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { Env } from "../lib/d1.ts";
import { hashPassword, signJwt, verifyJwt, verifyPassword, type Claims } from "../lib/crypto.ts";
import { ulid } from "../../../shared/sync.ts";

export const COOKIE = "kisan_session";
const SESSION_SEC = 7 * 24 * 3600;
const ROLES = ["field_worker", "admin"] as const;
type Vars = { user: Claims };

function secret(env: Env): string {
  const s = env.JWT_SECRET ?? "";
  if (s.length < 32) throw new Error("JWT_SECRET must be set (32+ characters)");
  return s;
}

export function requireUser(roles: readonly string[] = ROLES): MiddlewareHandler<{ Bindings: Env; Variables: Vars }> {
  return async (c, next) => {
    const token = getCookie(c, COOKIE);
    const claims = token ? await verifyJwt(token, secret(c.env)) : null;
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
    const count = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM app_user WHERE deleted = 0").first<{ n: number }>();
    let role: string;
    if (!count?.n) {
      role = "admin"; // bootstrap: the very first account
    } else {
      const token = getCookie(c, COOKIE);
      const claims = token ? await verifyJwt(token, secret(c.env)) : null;
      if (claims?.role !== "admin") return c.json({ error: "only an admin can add accounts" }, 403);
      role = ROLES.includes(body?.role as never) ? String(body!.role) : "field_worker";
    }
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
    const u = await c.env.DB.prepare("SELECT id, name, email, role, password_hash FROM app_user WHERE email = ? AND deleted = 0")
      .bind(email).first<UserRow>();
    // Same message for unknown email and wrong password.
    if (!u || !(await verifyPassword(String(body?.password ?? ""), u.password_hash)) || !ROLES.includes(u.role as never)) {
      return c.json({ error: "email or password is wrong" }, 401);
    }
    const { password_hash: _, ...user } = u;
    await startSession(c, user);
    return c.json({ user });
  });

  app.post("/logout", c => {
    deleteCookie(c, COOKIE, { path: "/" });
    return c.json({ ok: true });
  });

  app.get("/me", requireUser(), c => {
    const u = c.get("user");
    return c.json({ user: { id: u.sub, name: u.name, role: u.role } });
  });

  return app;
}
