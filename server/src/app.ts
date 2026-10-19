// The HTTP API. `deps` makes time and the network injectable for tests.
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./lib/d1.ts";
import { authRoutes } from "./routes/auth.ts";
import { syncRoutes } from "./routes/sync.ts";
import { mandiRoutes, type Deps } from "./routes/mandi.ts";

export function createApp(deps: Deps = { fetch: (...a) => fetch(...a), now: () => Date.now() }) {
  const app = new Hono<{ Bindings: Env }>();

  app.use("/api/*", async (c, next) => {
    const allowed = (c.env.ALLOWED_ORIGINS ?? "").split(",").map(s => s.trim()).filter(Boolean);
    return cors({ origin: o => (allowed.includes(o) ? o : null), credentials: true, allowMethods: ["GET", "POST"] })(c, next);
  });
  // Writes must be JSON, so a plain cross-site form post can never reach them.
  app.use("/api/*", async (c, next) => {
    if (c.req.method === "POST" && !(c.req.header("content-type") ?? "").startsWith("application/json")) {
      return c.json({ error: "send application/json" }, 415);
    }
    await next();
  });

  app.get("/api/health", c => c.json({ ok: true }));
  app.route("/api/auth", authRoutes(deps.now));
  app.route("/api/sync", syncRoutes(deps.now));
  app.route("/api/mandi", mandiRoutes(deps));
  app.onError((e, c) => {
    console.error("server error:", e.message);
    return c.json({ error: "server error" }, 500);
  });
  return app;
}
