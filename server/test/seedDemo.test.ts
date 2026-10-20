import { test } from "node:test";
import assert from "node:assert/strict";
import { sqliteD1 } from "../src/lib/sqlite-d1.ts";
import { seedDemo } from "../src/seedDemo.ts";
import { SECRET } from "./helpers.ts";

const accounts = { adminEmail: "demo-admin@example.org", workerEmail: "demo-worker@example.org", password: "change-me-demo-only" };

test("seed creates a demo admin and a demo field worker, and is safe to run twice", async () => {
  const env = { DB: sqliteD1(":memory:", new URL("../migrations/", import.meta.url)), JWT_SECRET: SECRET };
  assert.deepEqual(await seedDemo(env, accounts), ["created admin demo-admin@example.org", "created field worker demo-worker@example.org"]);
  assert.deepEqual(await seedDemo(env, accounts), ["demo accounts already exist"]);
  const roles = await env.DB.prepare("SELECT email, role FROM app_user ORDER BY role").all();
  assert.deepEqual(roles.results.map(r => ({ ...r })), [
    { email: "demo-admin@example.org", role: "admin" }, { email: "demo-worker@example.org", role: "field_worker" }]);
});

test("seed refuses a short password", async () => {
  const env = { DB: sqliteD1(":memory:", new URL("../migrations/", import.meta.url)), JWT_SECRET: SECRET };
  await assert.rejects(seedDemo(env, { ...accounts, password: "short" }));
});
