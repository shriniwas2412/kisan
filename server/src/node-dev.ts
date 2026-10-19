// Local server on plain Node (no wrangler needed): node:sqlite file + the same app.
// npm run dev  ->  http://localhost:8787  (reads .dev.vars if present)
import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { sqliteD1 } from "./lib/sqlite-d1.ts";
import { existsSync } from "node:fs";

const file = new URL("../.local.sqlite", import.meta.url).pathname;
const fresh = !existsSync(file);
const DB = sqliteD1(file, fresh ? new URL("../migrations/", import.meta.url) : undefined);
const env = {
  DB,
  JWT_SECRET: process.env.JWT_SECRET,
  DATA_GOV_IN_KEY: process.env.DATA_GOV_IN_KEY,
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS ?? "http://localhost:5173",
  MANDI_LIMIT: process.env.MANDI_LIMIT ?? "10",
  COOKIE_INSECURE: "1",
};
if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) {
  console.error("Set JWT_SECRET (32+ chars) in server/.dev.vars first.");
  process.exit(1);
}
const app = createApp();
serve({ fetch: req => app.fetch(req, env), port: 8787 }, i =>
  console.log(`kisan-server on http://localhost:${i.port} (mandi key ${env.DATA_GOV_IN_KEY ? "set" : "not set"})`));
