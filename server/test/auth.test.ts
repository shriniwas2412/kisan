import { test } from "node:test";
import assert from "node:assert/strict";
import { setup, signIn, SECRET } from "./helpers.ts";
import { hashPassword, verifyPassword, signJwt, verifyJwt } from "../src/lib/crypto.ts";

test("PBKDF2 hash verifies the right password only, with a random salt", async () => {
  const h = await hashPassword("test-password-1", 1000);
  assert.match(h, /^pbkdf2\$1000\$/);
  assert.equal(await verifyPassword("test-password-1", h), true);
  assert.equal(await verifyPassword("wrong", h), false);
  assert.notEqual(h, await hashPassword("test-password-1", 1000));
  assert.equal(await verifyPassword("x", "garbage"), false);
});

test("JWT: tampered, wrong-secret and expired tokens are refused", async () => {
  const claims = { sub: "u1", role: "field_worker", name: "Test Worker", exp: 2000 };
  const t = await signJwt(claims, SECRET);
  assert.deepEqual(await verifyJwt(t, SECRET, 1000), claims);
  assert.equal(await verifyJwt(t, SECRET, 2000), null);
  assert.equal(await verifyJwt(t, "another-secret-another-secret-0000000", 1000), null);
  const [h, , s] = t.split(".");
  const forged = btoa(JSON.stringify({ ...claims, role: "admin" })).replace(/=+$/, "");
  assert.equal(await verifyJwt(`${h}.${forged}.${s}`, SECRET, 1000), null);
});

test("there is no open bootstrap: registering on an empty server is refused", async () => {
  const s = setup();
  const r = await s.req("/api/auth/register", { method: "POST", body: JSON.stringify({ name: "Anyone", email: "a@test.example", password: "test-password-1" }) });
  assert.equal(r.status, 403);
  assert.equal((await s.env.DB.prepare("SELECT COUNT(*) AS n FROM app_user").first<{ n: number }>())!.n, 0);
});

test("the operator creates the admin with the script function; later sign-ups need an admin", async () => {
  const { createAdmin } = await import("../src/admin.ts");
  const s = setup();
  assert.equal((await createAdmin(s.env, { name: "Test Admin", email: "A@test.example", password: "test-password-1" })).role, "admin");
  await assert.rejects(createAdmin(s.env, { name: "Twice", email: "a@test.example", password: "test-password-1" }));
  await assert.rejects(createAdmin(s.env, { name: "Short", email: "b@test.example", password: "short" }));
  const r2 = await s.req("/api/auth/register", { method: "POST", body: JSON.stringify({ name: "Intruder", email: "b@test.example", password: "test-password-2" }) });
  assert.equal(r2.status, 403);
});

test("weak or placeholder JWT secrets are refused", async () => {
  const { secretProblem } = await import("../src/lib/secret.ts");
  assert.equal(secretProblem("replace-with-32-or-more-random-characters"), "placeholder");
  assert.equal(secretProblem(""), "missing");
  assert.equal(secretProblem("short-secret"), "too_short");
  assert.equal(secretProblem("aaaaaaaaaaaaaaaabbbbbbbbbbbbbbbbbbbb"), "too_simple");
  assert.equal(secretProblem(SECRET), null);
  const s = setup();
  s.env.JWT_SECRET = "replace-with-32-or-more-random-characters";
  const r = await s.req("/api/auth/me", { headers: { cookie: "kisan_session=x.y.z" } });
  assert.equal(r.status, 500, "server refuses to use a placeholder secret");
});

test("the local server listens on 127.0.0.1 unless HOST is set", async () => {
  const { listenHost } = await import("../src/lib/secret.ts");
  assert.equal(listenHost({}), "127.0.0.1");
  assert.equal(listenHost({ HOST: "0.0.0.0" }), "0.0.0.0");
});

test("five wrong passwords lock that email for 15 minutes", async () => {
  const s = setup(); await signIn(s.req);
  const login = (password: string, ip = "10.0.0.1") => s.req("/api/auth/login", { method: "POST", headers: { "cf-connecting-ip": ip }, body: JSON.stringify({ email: "admin@test.example", password }) });
  for (let i = 0; i < 5; i++) assert.equal((await login("wrong-password")).status, 401);
  assert.equal((await login("test-password-1")).status, 429, "even the right password waits");
  assert.equal((await login("test-password-1", "10.0.0.2")).status, 429, "per email, from any address");
  s.clock.set("2026-10-19T10:16:00Z");
  assert.equal((await login("test-password-1")).status, 200);
});

test("many failures from one address are capped across emails", async () => {
  const s = setup(); await signIn(s.req);
  for (let i = 0; i < 20; i++) {
    await s.req("/api/auth/login", { method: "POST", headers: { "cf-connecting-ip": "10.9.9.9" }, body: JSON.stringify({ email: `x${i}@test.example`, password: "nope-nope" }) });
  }
  const r = await s.req("/api/auth/login", { method: "POST", headers: { "cf-connecting-ip": "10.9.9.9" }, body: JSON.stringify({ email: "admin@test.example", password: "test-password-1" }) });
  assert.equal(r.status, 429);
  const other = await s.req("/api/auth/login", { method: "POST", headers: { "cf-connecting-ip": "10.1.1.1" }, body: JSON.stringify({ email: "admin@test.example", password: "test-password-1" }) });
  assert.equal(other.status, 200);
});

test("attempts are stored without the raw IP address", async () => {
  const s = setup(); await signIn(s.req);
  await s.req("/api/auth/login", { method: "POST", headers: { "cf-connecting-ip": "10.7.7.7" }, body: JSON.stringify({ email: "admin@test.example", password: "wrong-password" }) });
  const rows = await s.env.DB.prepare("SELECT * FROM login_attempt").all();
  assert.ok(rows.results.length > 0);
  assert.ok(!JSON.stringify(rows.results).includes("10.7.7.7"));
});

test("login sets an httpOnly cookie; /me works with it and fails without", async () => {
  const s = setup();
  await signIn(s.req, "a@test.example");
  const bad = await s.req("/api/auth/login", { method: "POST", body: JSON.stringify({ email: "a@test.example", password: "nope" }) });
  assert.equal(bad.status, 401);
  const res = await s.req("/api/auth/login", { method: "POST", body: JSON.stringify({ email: "A@test.example", password: "test-password-1" }) });
  const sc = res.headers.get("set-cookie") ?? "";
  assert.match(sc, /HttpOnly/i);
  assert.match(sc, /SameSite=Lax/i);
  assert.match(sc, /Secure/i);
  const cookie = sc.split(";")[0];
  assert.equal((await (await s.req("/api/auth/me", {}, cookie)).json()).user.role, "admin");
  assert.equal((await s.req("/api/auth/me")).status, 401);
});

test("admin adds a field worker, who cannot add accounts", async () => {
  const s = setup();
  const admin = await signIn(s.req);
  const r = await s.req("/api/auth/register", { method: "POST", body: JSON.stringify({ name: "Test Worker 1", email: "w@test.example", password: "test-password-2", role: "field_worker" }) }, admin);
  assert.equal((await r.json()).user.role, "field_worker");
  const login = await s.req("/api/auth/login", { method: "POST", body: JSON.stringify({ email: "w@test.example", password: "test-password-2" }) });
  const worker = (login.headers.get("set-cookie") ?? "").split(";")[0];
  const r2 = await s.req("/api/auth/register", { method: "POST", body: JSON.stringify({ name: "X", email: "x@test.example", password: "test-password-3" }) }, worker);
  assert.equal(r2.status, 403);
});

test("POST without JSON content type is refused (CSRF guard)", async () => {
  const s = setup();
  const r = await s.app.request("/api/auth/login", { method: "POST", body: "email=a", headers: { "content-type": "application/x-www-form-urlencoded" } }, s.env);
  assert.equal(r.status, 415);
});

test("the local database picks up new migrations on an existing file", async () => {
  const { sqliteD1 } = await import("../src/lib/sqlite-d1.ts");
  const { mkdtempSync, mkdirSync, copyFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "kisan-mig-"));
  const migs = join(dir, "migrations"); mkdirSync(migs);
  copyFileSync(new URL("../migrations/0001_init.sql", import.meta.url), join(migs, "0001_init.sql"));
  const file = join(dir, "local.sqlite");
  sqliteD1(file, new URL(`file://${migs}/`)).raw.close();
  copyFileSync(new URL("../migrations/0002_login_attempt.sql", import.meta.url), join(migs, "0002_login_attempt.sql"));
  const db = sqliteD1(file, new URL(`file://${migs}/`));
  assert.ok(await db.prepare("SELECT name FROM sqlite_master WHERE name = 'login_attempt'").first());
  db.raw.close();
});
