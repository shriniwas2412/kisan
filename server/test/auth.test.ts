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

test("first account becomes admin; later sign-ups need an admin", async () => {
  const s = setup();
  const r1 = await s.req("/api/auth/register", { method: "POST", body: JSON.stringify({ name: "Test Admin", email: "a@test.example", password: "test-password-1" }) });
  assert.equal(r1.status, 201);
  assert.equal((await r1.json()).user.role, "admin");
  const r2 = await s.req("/api/auth/register", { method: "POST", body: JSON.stringify({ name: "Intruder", email: "b@test.example", password: "test-password-2" }) });
  assert.equal(r2.status, 403);
});

test("login sets an httpOnly cookie; /me works with it and fails without", async () => {
  const s = setup();
  await s.req("/api/auth/register", { method: "POST", body: JSON.stringify({ name: "Test Admin", email: "a@test.example", password: "test-password-1" }) });
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
