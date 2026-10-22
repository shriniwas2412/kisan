// Local server on plain Node (no wrangler needed): node:sqlite file + the same app.
// npm run dev  ->  http://localhost:8787  (reads .dev.vars if present)
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createApp } from "./app.ts";
import { sqliteD1 } from "./lib/sqlite-d1.ts";
import { existsSync } from "node:fs";
import { listenHost, secretProblem } from "./lib/secret.ts";

const file = new URL("../.local.sqlite", import.meta.url).pathname;
const DB = sqliteD1(file, new URL("../migrations/", import.meta.url));
const env = {
  DB,
  JWT_SECRET: process.env.JWT_SECRET,
  DATA_GOV_IN_KEY: process.env.DATA_GOV_IN_KEY,
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS ?? "http://localhost:5173",
  MANDI_LIMIT: process.env.MANDI_LIMIT ?? "10",
  COOKIE_INSECURE: "1",
};
const problem = secretProblem(env.JWT_SECRET);
if (problem) {
  console.error(`JWT_SECRET in server/.dev.vars is not usable (${problem}). Make one with: npm run gen-secret`);
  process.exit(1);
}
const app = createApp();
// For local checks, also serve the built web app (npm run build in web/) from the same origin.
const dist = new URL("../../web/dist/", import.meta.url).pathname;
if (existsSync(dist)) app.use("/*", serveStatic({ root: dist }));
const hostname = listenHost(process.env);
serve({ fetch: req => app.fetch(req, env), port: 8787, hostname }, i =>
  console.log(`kisan-server on http://${hostname}:${i.port} (mandi key ${env.DATA_GOV_IN_KEY ? "set" : "not set"})`));
